import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import {
  makeEndpointFactory,
  makeOpenRouterFactory,
  makeVercelFactory,
} from "./byok";
import { ProviderHttp } from "./http";
import { probeEndpointModels } from "./probe";
import { makeImageModelFor } from "./image-byok";
import { makeVideoModelFor } from "./video-byok";

const PROMPT = {
  prompt: [{ role: "user", content: [{ type: "text", text: "hello" }] }],
};

async function attemptModelRequest(model: unknown): Promise<void> {
  await (model as { doGenerate: (options: unknown) => Promise<unknown> })
    .doGenerate(PROMPT)
    .catch(() => undefined);
}

describe("ProviderHttp", () => {
  it("omission dereferences ambient globalThis.fetch at call time", async () => {
    // CLI hosts and existing tests intentionally retain ambient fetch. Resolve
    // it per call so a late test stub (or host polyfill) still takes effect.
    const original = globalThis.fetch;
    const ambient = vi.fn<typeof globalThis.fetch>(
      async () => new Response("ok")
    );
    const http = new ProviderHttp();
    expect(http.isHostRouted).toBe(false);
    globalThis.fetch = ambient as unknown as typeof globalThis.fetch;
    try {
      await http.request("https://provider.example/request");
      await http.download("https://cdn.example/result");
    } finally {
      globalThis.fetch = original;
    }
    expect(ambient).toHaveBeenCalledTimes(2);
  });

  it("every in-process text provider uses request, never download", async () => {
    // The thrown sentinel stops each real SDK immediately after it crosses the
    // transport seam; URL assertions prove OpenRouter, Vercel Gateway, and the
    // generalized OpenAI-compatible endpoint all reached the supplied request.
    const urls: string[] = [];
    const request: typeof globalThis.fetch = async (input) => {
      urls.push(String(input));
      throw new Error("transport sentinel");
    };
    const download = vi.fn<typeof globalThis.fetch>(async () => {
      throw new Error("text providers must not download public media");
    });
    const http = new ProviderHttp({ request, download });
    expect(http.isHostRouted).toBe(true);

    await attemptModelRequest(makeOpenRouterFactory("sk-or", http)("pro"));
    await attemptModelRequest(makeVercelFactory("sk-v", http)("pro"));
    await attemptModelRequest(
      makeEndpointFactory(
        {
          id: "local",
          base_url: "http://localhost:11434/v1",
          default_model_id: "local-model",
        },
        http
      )("pro")
    );

    expect(urls).toEqual([
      "https://openrouter.ai/api/v1/chat/completions",
      "https://ai-gateway.vercel.sh/v3/ai/language-model",
      "http://localhost:11434/v1/chat/completions",
    ]);
    expect(download).not.toHaveBeenCalled();
  });

  it("leaves concrete request authorization to the host with no fallback", async () => {
    let observed: Request | undefined;
    const request = vi.fn<typeof globalThis.fetch>(async (input, init) => {
      observed = new Request(input, init);
      throw new Error("host policy denied provider request");
    });
    const download = vi.fn<typeof globalThis.fetch>();
    const http = new ProviderHttp({ request, download });
    const model = makeOpenRouterFactory("sk-host-policy", http)("pro");

    await expect(
      (
        model as unknown as {
          doGenerate: (options: unknown) => PromiseLike<unknown>;
        }
      ).doGenerate(PROMPT)
    ).rejects.toThrow(/host policy denied provider request/);

    expect(observed?.url).toBe("https://openrouter.ai/api/v1/chat/completions");
    expect(observed?.method).toBe("POST");
    expect(observed?.headers.get("authorization")).toBe(
      "Bearer sk-host-policy"
    );
    expect(request).toHaveBeenCalledTimes(1);
    expect(download).not.toHaveBeenCalled();
  });

  it("endpoint discovery uses request, never download", async () => {
    const request = vi.fn<typeof globalThis.fetch>(async (input) => {
      const url = String(input);
      if (url.endsWith("/api/tags")) {
        return new Response(
          JSON.stringify({
            models: [{ name: "local-model", capabilities: ["tools"] }],
          }),
          { status: 200 }
        );
      }
      if (url.endsWith("/api/ps")) {
        return new Response(
          JSON.stringify({
            models: [{ name: "local-model", context_length: 4096 }],
          }),
          { status: 200 }
        );
      }
      return new Response("not found", { status: 404 });
    });
    const download = vi.fn<typeof globalThis.fetch>();
    const http = new ProviderHttp({ request, download });

    const result = await probeEndpointModels(
      "http://localhost:11434/v1",
      http.request
    );

    expect(result).toEqual({
      ok: true,
      source: "ollama",
      models: [{ id: "local-model", tool_call: true, contextWindow: 4096 }],
    });
    expect(request.mock.calls.map(([input]) => String(input))).toEqual([
      "http://localhost:11434/api/tags",
      "http://localhost:11434/v1/models",
      "http://localhost:11434/api/ps",
    ]);
    expect(download).not.toHaveBeenCalled();
  });

  it("bounds transport concurrency while enriching a 64-model Ollama listing", async () => {
    const modelIds = Array.from({ length: 64 }, (_, index) => `model-${index}`);
    let activeShowRequests = 0;
    let maxActiveShowRequests = 0;
    let showRequests = 0;
    const showModels: string[] = [];
    const request = vi.fn<typeof globalThis.fetch>(async (input, init) => {
      const url = String(input);
      if (url.endsWith("/api/tags")) {
        return new Response(
          JSON.stringify({ models: modelIds.map((name) => ({ name })) }),
          { status: 200 }
        );
      }
      if (url.endsWith("/v1/models")) {
        return new Response("not found", { status: 404 });
      }
      if (url.endsWith("/api/ps")) {
        return new Response(JSON.stringify({ models: [] }), { status: 200 });
      }
      if (url.endsWith("/api/show")) {
        const body = JSON.parse(String(init?.body)) as { model: string };
        showModels.push(body.model);
        showRequests++;
        activeShowRequests++;
        maxActiveShowRequests = Math.max(
          maxActiveShowRequests,
          activeShowRequests
        );
        // Hold each request for one event-loop turn so an accidental
        // Promise.all(models) burst is observable deterministically.
        await new Promise<void>((resolve) => setTimeout(resolve, 1));
        activeShowRequests--;
        return new Response(
          JSON.stringify({
            model_info: { "test.context_length": 32_768 },
          }),
          { status: 200 }
        );
      }
      throw new Error(`unexpected provider request: ${url}`);
    });
    const download = vi.fn<typeof globalThis.fetch>();
    const http = new ProviderHttp({ request, download });

    const result = await probeEndpointModels(
      "http://localhost:11434/v1",
      http.request
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.models).toHaveLength(64);
    expect(result.models.every((model) => model.contextWindow === 32_768)).toBe(
      true
    );
    expect(showRequests).toBe(64);
    expect([...showModels].sort()).toEqual([...modelIds].sort());
    expect(maxActiveShowRequests).toBeLessThanOrEqual(8);
    expect(download).not.toHaveBeenCalled();
  });

  it("OpenRouter and Vercel media SDK calls use request", async () => {
    const urls: string[] = [];
    const request: typeof globalThis.fetch = async (input) => {
      urls.push(String(input));
      throw new Error("transport sentinel");
    };
    const download = vi.fn<typeof globalThis.fetch>();
    const http = new ProviderHttp({ request, download });

    await Promise.resolve(
      makeImageModelFor(
        "openrouter",
        "sk-or",
        "openai/gpt-image-1",
        http
      ).doGenerate({
        prompt: "image",
        n: 1,
        size: undefined,
        aspectRatio: undefined,
        seed: undefined,
        files: undefined,
        mask: undefined,
        providerOptions: {},
      })
    ).catch(() => undefined);
    await Promise.resolve(
      makeImageModelFor(
        "vercel",
        "sk-v",
        "openai/gpt-image-1",
        http
      ).doGenerate({
        prompt: "image",
        n: 1,
        size: undefined,
        aspectRatio: undefined,
        seed: undefined,
        files: undefined,
        mask: undefined,
        providerOptions: {},
      })
    ).catch(() => undefined);
    await Promise.resolve(
      makeVideoModelFor("vercel", "sk-v", "google/veo", http).doGenerate({
        prompt: "video",
        n: 1,
        aspectRatio: undefined,
        resolution: undefined,
        duration: undefined,
        fps: undefined,
        seed: undefined,
        image: undefined,
        providerOptions: {},
      })
    ).catch(() => undefined);

    expect(urls).toEqual([
      "https://openrouter.ai/api/v1/images",
      "https://ai-gateway.vercel.sh/v3/ai/image-model",
      "https://ai-gateway.vercel.sh/v3/ai/video-model",
    ]);
    expect(download).not.toHaveBeenCalled();
  });

  it("automatic downloads reject private URLs before host I/O", async () => {
    const request = vi.fn<typeof globalThis.fetch>();
    const download = vi.fn<typeof globalThis.fetch>();
    const http = new ProviderHttp({ request, download });

    await expect(
      http.downloadParts([
        {
          url: new URL("http://127.0.0.1/private.png"),
          isUrlSupportedByModel: false,
        },
      ])
    ).rejects.toThrow(/must be public/);
    expect(download).not.toHaveBeenCalled();
    expect(request).not.toHaveBeenCalled();
  });

  it("cancels a non-success response body before rejecting it", async () => {
    const cancel = vi.fn<(reason?: unknown) => void>();
    const body = new ReadableStream<Uint8Array>({
      pull() {},
      cancel,
    });
    const request = vi.fn<typeof globalThis.fetch>();
    const download = vi.fn<typeof globalThis.fetch>(
      async () => new Response(body, { status: 502, statusText: "Bad Gateway" })
    );
    const http = new ProviderHttp({ request, download });

    await expect(
      http.downloadParts([
        {
          url: new URL("https://cdn.example/failed.png"),
          isUrlSupportedByModel: false,
        },
      ])
    ).rejects.toThrow(/502 Bad Gateway/);
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it("cancels a response body when its reported redirect target is unsafe", async () => {
    const cancel = vi.fn<(reason?: unknown) => void>();
    const response = new Response(
      new ReadableStream<Uint8Array>({ pull() {}, cancel }),
      { status: 200 }
    );
    Object.defineProperties(response, {
      redirected: { value: true },
      url: { value: "http://127.0.0.1/private.png" },
    });
    const request = vi.fn<typeof globalThis.fetch>();
    const download = vi.fn<typeof globalThis.fetch>(async () => response);
    const http = new ProviderHttp({ request, download });

    await expect(
      http.downloadParts([
        {
          url: new URL("https://cdn.example/redirect.png"),
          isUrlSupportedByModel: false,
        },
      ])
    ).rejects.toThrow(/must be public/);
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it("cancels a declared-oversize response body before rejecting it", async () => {
    const cancel = vi.fn<(reason?: unknown) => void>();
    const body = new ReadableStream<Uint8Array>({
      pull() {},
      cancel,
    });
    const request = vi.fn<typeof globalThis.fetch>();
    const download = vi.fn<typeof globalThis.fetch>(
      async () =>
        new Response(body, {
          status: 200,
          headers: { "content-length": "4" },
        })
    );
    const http = new ProviderHttp(
      { request, download },
      { max_download_bytes: 3 }
    );

    await expect(
      http.downloadParts([
        {
          url: new URL("https://cdn.example/too-large.png"),
          isUrlSupportedByModel: false,
        },
      ])
    ).rejects.toThrow(/download is too large/);
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it("decodes base64 data URLs locally without crossing host HTTP", async () => {
    const request = vi.fn<typeof globalThis.fetch>();
    const download = vi.fn<typeof globalThis.fetch>();
    const http = new ProviderHttp({ request, download });

    await expect(
      http.downloadParts([
        {
          url: new URL("data:image/png;base64,iVBORw=="),
          isUrlSupportedByModel: false,
        },
      ])
    ).resolves.toEqual([
      {
        data: Uint8Array.from([0x89, 0x50, 0x4e, 0x47]),
        mediaType: "image/png",
      },
    ]);
    expect(request).not.toHaveBeenCalled();
    expect(download).not.toHaveBeenCalled();
  });

  it("decodes percent-encoded data URL bytes and preserves media type", async () => {
    const request = vi.fn<typeof globalThis.fetch>();
    const download = vi.fn<typeof globalThis.fetch>();
    const http = new ProviderHttp({ request, download });

    await expect(
      http.downloadParts([
        {
          url: new URL(
            "data:text/plain;charset=utf-8,hello%20%E2%98%83#not-content"
          ),
          isUrlSupportedByModel: false,
        },
      ])
    ).resolves.toEqual([
      {
        data: new TextEncoder().encode("hello ☃"),
        mediaType: "text/plain;charset=utf-8",
      },
    ]);
    expect(request).not.toHaveBeenCalled();
    expect(download).not.toHaveBeenCalled();
  });

  it("enforces the decoded-byte bound for inline data before host I/O", async () => {
    const request = vi.fn<typeof globalThis.fetch>();
    const download = vi.fn<typeof globalThis.fetch>();
    const http = new ProviderHttp(
      { request, download },
      { max_download_bytes: 3 }
    );

    await expect(
      http.downloadParts([
        {
          url: new URL("data:application/octet-stream;base64,AQIDBA=="),
          isUrlSupportedByModel: false,
        },
      ])
    ).rejects.toThrow(/exceeds maximum size of 3 bytes/);
    expect(request).not.toHaveBeenCalled();
    expect(download).not.toHaveBeenCalled();
  });

  it("rejects malformed inline base64 without crossing host HTTP", async () => {
    const request = vi.fn<typeof globalThis.fetch>();
    const download = vi.fn<typeof globalThis.fetch>();
    const http = new ProviderHttp({ request, download });

    await expect(
      http.downloadParts([
        {
          url: new URL("data:image/png;base64,%%%"),
          isUrlSupportedByModel: false,
        },
      ])
    ).rejects.toThrow(/invalid base64 data URL/);
    expect(request).not.toHaveBeenCalled();
    expect(download).not.toHaveBeenCalled();
  });

  it("stays out of neutral APIs, tools, shell, and external-agent execution", () => {
    // These are capability boundaries, not merely call-site conventions. A
    // future import would hand network execution to code outside the provider
    // layer and must be an explicit contract review.
    const foreignSurfaces = [
      "../index.ts",
      "../tools/index.ts",
      "../tools/run-command.ts",
      "../runtime/command-backend.ts",
      "../runtime/agent-provider-run.ts",
      "../agent-provider/index.ts",
    ];

    for (const path of foreignSurfaces) {
      const source = readFileSync(new URL(path, import.meta.url), "utf8");
      expect(source).not.toMatch(/ProviderHttp|providers\/http/);
    }
  });
});
