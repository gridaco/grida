/**
 * `/video/generate` route (#908) — bare Hono app, fake secrets. The happy path
 * goes through fal (a plain-fetch adapter) with host-fed HTTP; the
 * error paths exercise resolve + validation. No SDK, no network.
 */
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Hono } from "hono";
import type { SecretsStore } from "@grida/daemon/server";
import { registerVideoRoutes } from "./video";
import { ProviderHttp } from "../../providers/http";

function fakeSecrets(keys: Record<string, string>): SecretsStore {
  return {
    _getKey: async (id: string) => keys[id] ?? null,
  } as unknown as SecretsStore;
}

function appWith(keys: Record<string, string>, providerHttp?: ProviderHttp) {
  const app = new Hono();
  registerVideoRoutes(app, {
    secrets: fakeSecrets(keys),
    provider_http: providerHttp,
  });
  return app;
}

function post(app: Hono, payload: unknown) {
  return app.request("/video/generate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
}

// Veo binds vercel + fal; fal is a plain-fetch adapter we can drive end-to-end.
const VEO = "google/veo-3.1";

/** Shape of the `init` arg our `fetch` mock reads. */
type MockInit = { method?: string; body?: string };

function vercelVideoResult(url: string): Response {
  return new Response(
    `data: ${JSON.stringify({
      type: "result",
      videos: [{ type: "url", url, mediaType: "video/mp4" }],
      warnings: [],
    })}\n\n`,
    {
      status: 200,
      headers: { "content-type": "text/event-stream" },
    }
  );
}

afterEach(() => vi.unstubAllGlobals());

describe("POST /video/generate", () => {
  it("200 + base64 video for a listed model via fal (sidecar downloads the clip)", async () => {
    const MP4 = new Uint8Array([0, 0, 0, 24]);
    const requestUrls: string[] = [];
    const request = vi.fn<
      (input: string | URL | Request, init?: MockInit) => Promise<Response>
    >(async (input: string | URL | Request, init: MockInit = {}) => {
      const url = String(input);
      requestUrls.push(url);
      if (init.method === "POST")
        return new Response(
          JSON.stringify({
            request_id: "r",
            status_url: "https://queue.fal.run/r/status",
            response_url: "https://queue.fal.run/r",
          }),
          { status: 200 }
        );
      if (url.endsWith("/status"))
        return new Response(JSON.stringify({ status: "COMPLETED" }), {
          status: 200,
        });
      return new Response(
        JSON.stringify({
          video: {
            url: "https://fal.media/v.mp4",
            content_type: "video/mp4",
          },
        }),
        { status: 200 }
      );
    });
    const download = vi.fn<
      (input: string | URL | Request, init?: RequestInit) => Promise<Response>
    >(async (input: string | URL | Request, init?: RequestInit) => {
      expect(String(input)).toBe("https://fal.media/v.mp4");
      expect(new Headers(init?.headers).has("authorization")).toBe(false);
      return new Response(MP4, {
        status: 200,
        headers: { "content-type": "video/mp4" },
      });
    });
    const providerHttp = new ProviderHttp({
      request: request as unknown as typeof globalThis.fetch,
      download: download as unknown as typeof globalThis.fetch,
    });
    const res = await post(appWith({ fal: "sk-fal" }, providerHttp), {
      model_id: VEO,
      prompt: "a cat surfing",
      provider: "fal",
    });
    expect(res.status).toBe(200);
    const json = (await res.json()) as Record<string, unknown>;
    expect(json.provider_id).toBe("fal");
    expect(json.videos).toEqual([
      { base64: Buffer.from(MP4).toString("base64"), media_type: "video/mp4" },
    ]);
    expect(requestUrls).toEqual([
      "https://queue.fal.run/fal-ai/veo3.1/image-to-video",
      "https://queue.fal.run/r/status",
      "https://queue.fal.run/r",
    ]);
    expect(download).toHaveBeenCalledOnce();
  });

  it("rejects an arbitrary Vercel result origin before host download", async () => {
    const request = vi.fn<typeof globalThis.fetch>(async (input) => {
      expect(String(input)).toBe(
        "https://ai-gateway.vercel.sh/v3/ai/video-model"
      );
      return vercelVideoResult("https://vendor-cdn.example/video.mp4?token=x");
    });
    const download = vi.fn<typeof globalThis.fetch>();
    const providerHttp = new ProviderHttp({ request, download });

    const res = await post(appWith({ vercel: "sk-v" }, providerHttp), {
      model_id: VEO,
      prompt: "a cat surfing",
      provider: "vercel",
    });

    expect(res.status).toBe(502);
    expect(await res.json()).toMatchObject({
      code: "unsupported_untrusted_result_origin",
      provider_id: "vercel",
      error: expect.stringContaining(
        "unsupported/untrusted-result-origin: https://vendor-cdn.example"
      ),
    });
    expect(download).not.toHaveBeenCalled();
  });

  it("decodes an inline Vercel data result without host download", async () => {
    const request = vi.fn<typeof globalThis.fetch>(async () =>
      vercelVideoResult("data:video/mp4;base64,AAAY")
    );
    const download = vi.fn<typeof globalThis.fetch>();
    const providerHttp = new ProviderHttp({ request, download });

    const res = await post(appWith({ vercel: "sk-v" }, providerHttp), {
      model_id: VEO,
      prompt: "a cat surfing",
      provider: "vercel",
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      provider_id: "vercel",
      videos: [{ base64: "AAAY", media_type: "video/mp4" }],
    });
    expect(download).not.toHaveBeenCalled();
  });

  it("permits an exact Vercel Gateway result origin through host download", async () => {
    const MP4 = new Uint8Array([0, 0, 0, 24]);
    const resultUrl = "https://ai-gateway.vercel.sh/results/video.mp4";
    const request = vi.fn<typeof globalThis.fetch>(async () =>
      vercelVideoResult(resultUrl)
    );
    const download = vi.fn<typeof globalThis.fetch>(async (input) => {
      expect(String(input)).toBe(resultUrl);
      return new Response(MP4, {
        status: 200,
        headers: { "content-type": "video/mp4" },
      });
    });
    const providerHttp = new ProviderHttp({ request, download });

    const res = await post(appWith({ vercel: "sk-v" }, providerHttp), {
      model_id: VEO,
      prompt: "a cat surfing",
      provider: "vercel",
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      provider_id: "vercel",
      videos: [
        {
          base64: Buffer.from(MP4).toString("base64"),
          media_type: "video/mp4",
        },
      ],
    });
    expect(download).toHaveBeenCalledOnce();
  });

  it("does not reflect a signed result capability when host download fails", async () => {
    const token = "opaque-signed-capability";
    const resultUrl = `https://ai-gateway.vercel.sh/results/video.mp4?X-Amz-Signature=${token}`;
    const request = vi.fn<typeof globalThis.fetch>(async () =>
      vercelVideoResult(resultUrl)
    );
    const download = vi.fn<typeof globalThis.fetch>(
      async () =>
        new Response(null, { status: 403, statusText: `Forbidden ${token}` })
    );
    const providerHttp = new ProviderHttp({ request, download });

    const res = await post(appWith({ vercel: "sk-v" }, providerHttp), {
      model_id: VEO,
      prompt: "a cat surfing",
      provider: "vercel",
    });

    expect(res.status).toBe(502);
    const text = await res.text();
    expect(text).toContain("provider asset download failed (HTTP 403)");
    expect(text).not.toContain(token);
    expect(text).not.toContain("X-Amz-Signature");
    expect(download).toHaveBeenCalledOnce();
  });

  it("fails closed on a remote Vercel result without host download authority", async () => {
    const resultUrl = "https://ai-gateway.vercel.sh/v3/ai/video-result.mp4";
    const ambient = vi.fn<(input: string | URL | Request) => Promise<Response>>(
      async () => vercelVideoResult(resultUrl)
    );
    vi.stubGlobal("fetch", ambient);

    const res = await post(appWith({ vercel: "sk-v" }), {
      model_id: VEO,
      prompt: "a cat surfing",
      provider: "vercel",
    });

    expect(res.status).toBe(502);
    expect(await res.json()).toMatchObject({
      error: "video fetch failed: provider asset download failed",
      provider_id: "vercel",
    });
    expect(ambient.mock.calls.map(([input]) => String(input))).toEqual([
      "https://ai-gateway.vercel.sh/v3/ai/video-model",
    ]);
  });

  it("400 for an unknown model id", async () => {
    const res = await post(appWith({ vercel: "sk-v" }), {
      model_id: "no/pe",
      prompt: "x",
    });
    expect(res.status).toBe(400);
  });

  it("400 when the connected provider does not serve the model", async () => {
    // Seedance has no fal binding.
    const res = await post(appWith({ fal: "sk-fal" }), {
      model_id: "bytedance/seedance-2.0",
      prompt: "x",
    });
    expect(res.status).toBe(400);
  });

  it("400 on a malformed body (missing prompt)", async () => {
    const res = await post(appWith({ fal: "sk-fal" }), { model_id: VEO });
    expect(res.status).toBe(400);
  });

  it("never leaks the api key in the response", async () => {
    // A real secret is present so a regression that echoes connected keys would
    // actually fail this assertion (an empty store could never leak).
    const res = await post(appWith({ fal: "sk-secret-123" }), {
      model_id: "no/pe",
      prompt: "x",
    });
    expect(await res.text()).not.toContain("sk-secret-123");
  });
});

describe("video route billing isolation", () => {
  const src = readFileSync(new URL("./video.ts", import.meta.url), "utf8");
  it("does not import the web billing server", () => {
    expect(src).not.toMatch(/(from|require\()\s*["'][^"']*editor\/lib\/ai/);
  });
  it("never sets the `grida` provider-option", () => {
    expect(src).not.toMatch(/grida\s*:\s*\{/);
    expect(src).not.toMatch(/providerOptions\s*\.\s*grida/);
  });
});
