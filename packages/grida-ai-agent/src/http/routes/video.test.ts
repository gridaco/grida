// GRIDA-SEC-004 / GRIDA-SEC-006 — real shared video operation, synthetic host transport.
// GRIDA-GG: provider — preserve the host's actionable GG response contract.
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Hono } from "hono";
import type { MediaItem } from "@grida/daemon";
import type { MediaPersistence, SecretsStore } from "@grida/daemon/server";
import { registerVideoRoutes, type VideoRoutesDeps } from "./video";
import { GridaGatewaySessionStore } from "@grida/ai";
import { ProviderHttp } from "../../providers/http";

function fakeSecrets(keys: Record<string, string>): SecretsStore {
  return {
    _getKey: async (id: string) => keys[id] ?? null,
  } as unknown as SecretsStore;
}

function appWith(
  keys: Record<string, string>,
  providerHttp?: ProviderHttp,
  media?: MediaPersistence | null,
  extra: Partial<VideoRoutesDeps> = {}
) {
  const app = new Hono();
  registerVideoRoutes(app, {
    secrets: fakeSecrets(keys),
    provider_http: providerHttp,
    media,
    ...extra,
  });
  return app;
}

function post(app: Hono, payload: unknown, signal?: AbortSignal) {
  return app.request("/video/generate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
    signal,
  });
}

// Veo binds vercel + fal; fal is a plain-fetch adapter we can drive end-to-end.
const VEO = "google/veo-3.1";

/** Shape of the `init` arg our `fetch` mock reads. */
type MockInit = { method?: string; body?: string };

function vercelVideoResults(urls: string[]): Response {
  return new Response(
    `data: ${JSON.stringify({
      type: "result",
      videos: urls.map((url) => ({
        type: "url",
        url,
        mediaType: "video/mp4",
      })),
      warnings: [],
    })}\n\n`,
    {
      status: 200,
      headers: { "content-type": "text/event-stream" },
    }
  );
}

function vercelVideoResult(url: string): Response {
  return vercelVideoResults([url]);
}

afterEach(() => vi.unstubAllGlobals());

describe("POST /video/generate", () => {
  it("forwards the start frame and options through the operation and returns the downloaded clip", async () => {
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
      image_url: "https://inputs.example/start.png",
      aspect_ratio: "16:9",
      resolution: "1280x720",
      duration: 8,
      fps: 24,
      seed: 7,
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
    expect(JSON.parse(String(request.mock.calls[0][1]?.body))).toEqual({
      prompt: "a cat surfing",
      image_url: "https://inputs.example/start.png",
      aspect_ratio: "16:9",
      resolution: "1280x720",
      duration: 8,
      fps: 24,
      seed: 7,
    });
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
      error: "video generation failed",
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
    expect(text).toContain("video generation failed");
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
      error: "video generation failed",
      provider_id: "vercel",
    });
    expect(ambient.mock.calls.map(([input]) => String(input))).toEqual([
      "https://ai-gateway.vercel.sh/v3/ai/video-model",
    ]);
  });

  it("returns a safe server failure when key access breaks during resolution", async () => {
    const request = vi.fn<typeof globalThis.fetch>();
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const app = appWith(
        {},
        new ProviderHttp({ request, download: request }),
        null,
        {
          secrets: {
            _getKey: async () => {
              throw new Error("private-key-reader-detail");
            },
          } as unknown as SecretsStore,
        }
      );
      const res = await post(app, { model_id: VEO, prompt: "x" });
      expect(res.status).toBe(502);
      expect(await res.json()).toEqual({
        error: "video generation failed",
        model_id: VEO,
      });
      expect(request).not.toHaveBeenCalled();
      expect(logged).not.toHaveBeenCalled();
    } finally {
      logged.mockRestore();
    }
  });

  it.each([
    { provider: "fal", model_id: VEO },
    { provider: "vercel", model_id: "xai/grok-imagine-video-1.5" },
    {
      provider: "gg",
      model_id: VEO,
      image_url: "https://inputs.example/start.png",
    },
  ])(
    "rejects an incompatible input mode before submission: %j",
    async (input) => {
      const request = vi.fn<typeof globalThis.fetch>();
      const gg = new GridaGatewaySessionStore();
      gg.set({
        access_token: "synthetic-gg",
        expires_at: Date.now() + 900_000,
      });
      const app = appWith(
        { fal: "synthetic-fal", vercel: "synthetic-vercel" },
        new ProviderHttp({ request, download: request }),
        null,
        { gg, gg_base_url: "https://grida.test" }
      );
      const res = await post(app, { ...input, prompt: "x" });
      expect(res.status).toBe(400);
      expect(request).not.toHaveBeenCalled();
    }
  );

  it.each([{ duration: -1 }, { seed: 0 }])(
    "rejects unsupported Vercel options before provider I/O or receipts: %j",
    async (options) => {
      const request = vi.fn<typeof globalThis.fetch>();
      const save = vi.fn<MediaPersistence["save"]>();
      const res = await post(
        appWith(
          { vercel: "key" },
          new ProviderHttp({ request, download: request }),
          { save }
        ),
        {
          model_id: VEO,
          provider: "vercel",
          prompt: "x",
          ...options,
        }
      );
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({
        error: "invalid video input",
        code: "invalid_input",
      });
      expect(request).not.toHaveBeenCalled();
      expect(save).not.toHaveBeenCalled();
    }
  );

  it("never logs or returns provider detail and never retries a failed submission", async () => {
    const sentinel = "synthetic-secret-prompt-upstream-body";
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    const request = vi.fn<typeof globalThis.fetch>(async () => {
      throw Object.assign(new Error(sentinel), { responseBody: sentinel });
    });
    const save = vi.fn<MediaPersistence["save"]>();
    try {
      const res = await post(
        appWith(
          { vercel: sentinel },
          new ProviderHttp({ request, download: request }),
          { save }
        ),
        {
          model_id: VEO,
          provider: "vercel",
          prompt: sentinel,
        }
      );
      expect(res.status).toBe(502);
      expect(await res.text()).not.toContain(sentinel);
      expect(JSON.stringify(logged.mock.calls)).not.toContain(sentinel);
      expect(request).toHaveBeenCalledOnce();
      expect(save).not.toHaveBeenCalled();
    } finally {
      logged.mockRestore();
    }
  });

  it("propagates request cancellation to the operation without persistence or retry", async () => {
    const controller = new AbortController();
    let started!: () => void;
    const submitted = new Promise<void>((resolve) => {
      started = resolve;
    });
    let providerSignal: AbortSignal | null | undefined;
    const request = vi.fn<typeof globalThis.fetch>(async (_input, init) => {
      providerSignal = init?.signal;
      started();
      return new Promise<Response>((_resolve, reject) => {
        providerSignal!.addEventListener(
          "abort",
          () => reject(providerSignal!.reason),
          { once: true }
        );
      });
    });
    const save = vi.fn<MediaPersistence["save"]>();
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const response = post(
        appWith(
          { vercel: "key" },
          new ProviderHttp({ request, download: request }),
          { save }
        ),
        {
          model_id: VEO,
          provider: "vercel",
          prompt: "x",
        },
        controller.signal
      );
      await submitted;
      controller.abort(new Error("private-abort-reason"));
      const res = await response;
      expect(providerSignal?.aborted).toBe(true);
      expect(res.status).toBe(502);
      expect(await res.text()).not.toContain("private-abort-reason");
      expect(JSON.stringify(logged.mock.calls)).not.toContain(
        "private-abort-reason"
      );
      expect(request).toHaveBeenCalledOnce();
      expect(save).not.toHaveBeenCalled();
    } finally {
      logged.mockRestore();
    }
  });

  it("uses scoped GG request authority and returns no hosted metadata", async () => {
    const gg = new GridaGatewaySessionStore();
    gg.set({ access_token: "synthetic-gg", expires_at: Date.now() + 900_000 });
    const request = vi.fn<typeof globalThis.fetch>(async (input, init) => {
      expect(String(input)).toBe(
        "https://grida.test/api/v1/ai/videos/generations"
      );
      expect(new Headers(init?.headers).get("authorization")).toBe(
        "Bearer synthetic-gg"
      );
      expect(JSON.parse(String(init?.body))).toEqual({
        model_id: VEO,
        prompt: "a wave",
        duration: 8,
      });
      return Response.json({
        videos: [{ base64: "YmFy", media_type: "video/mp4" }],
        metadata: "private-hosted-field",
      });
    });
    const download = vi.fn<typeof globalThis.fetch>();
    const res = await post(
      appWith({}, new ProviderHttp({ request, download }), null, {
        gg,
        gg_base_url: "https://grida.test",
      }),
      {
        model_id: VEO,
        prompt: "a wave",
        provider: "gg",
        duration: 8,
      }
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      model_id: VEO,
      provider_id: "gg",
      videos: [{ base64: "YmFy", media_type: "video/mp4" }],
    });
    expect(request).toHaveBeenCalledOnce();
    expect(download).not.toHaveBeenCalled();
  });

  it.each([
    [401, "gg_token_expired"],
    [402, "insufficient_credits"],
  ] as const)("preserves actionable GG HTTP %s", async (status, code) => {
    const gg = new GridaGatewaySessionStore();
    gg.set({ access_token: "synthetic-gg", expires_at: Date.now() + 900_000 });
    const request = vi.fn<typeof globalThis.fetch>(
      async () => new Response("private-upstream", { status })
    );
    const save = vi.fn<MediaPersistence["save"]>();
    const res = await post(
      appWith(
        {},
        new ProviderHttp({ request, download: request }),
        { save },
        { gg, gg_base_url: "https://grida.test" }
      ),
      {
        model_id: VEO,
        prompt: "x",
        provider: "gg",
      }
    );
    expect(res.status).toBe(status);
    expect(await res.json()).toMatchObject({ code, provider_id: "gg" });
    expect(request).toHaveBeenCalledOnce();
    expect(save).not.toHaveBeenCalled();
  });

  it("400 for an unknown model id", async () => {
    const res = await post(appWith({ vercel: "sk-v" }), {
      model_id: "no/pe",
      prompt: "x",
    });
    expect(res.status).toBe(400);
  });

  it("400 when the connected provider does not serve the model", async () => {
    // Seedance has no vercel binding (token-metered on the gateway; the
    // catalogue withholds an unpriceable route). fal DOES serve it — which
    // is why this case must not use a fal key: it would reach fal for real.
    const res = await post(appWith({ vercel: "sk-v" }), {
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

  it("offers every output to the host store and correlates only accepted descriptors", async () => {
    const request = vi.fn<typeof globalThis.fetch>(async () =>
      vercelVideoResults([
        "data:video/mp4;base64,AAAY",
        "data:video/mp4;base64,AQID",
      ])
    );
    const download = vi.fn<typeof globalThis.fetch>();
    const providerHttp = new ProviderHttp({ request, download });
    const stored: MediaItem = {
      id: "7ccb8e68-a201-40d9-a793-44de9e6c6fc6",
      file_name: "video-1.mp4",
      media_type: "video/mp4",
      byte_size: 3,
      created_at: 1,
    };
    const save = vi.fn<MediaPersistence["save"]>();
    save.mockResolvedValueOnce(stored);
    save.mockRejectedValueOnce(new Error("media-too-large"));
    const warning = vi.spyOn(console, "warn").mockImplementation(() => {});

    const res = await post(
      appWith({ vercel: "sk-v" }, providerHttp, { save }),
      {
        model_id: VEO,
        prompt: "must not enter storage",
        provider: "vercel",
      }
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      videos: [
        {
          base64: "AAAY",
          media_type: "video/mp4",
          stored_media: stored,
        },
        { base64: "AQID", media_type: "video/mp4" },
      ],
    });
    expect(save).toHaveBeenNthCalledWith(1, {
      file_name: "video-1.mp4",
      media_type: "video/mp4",
      bytes: Buffer.from("AAAY", "base64"),
    });
    expect(save).toHaveBeenNthCalledWith(2, {
      file_name: "video-2.mp4",
      media_type: "video/mp4",
      bytes: Buffer.from("AQID", "base64"),
    });
    expect(JSON.stringify(save.mock.calls)).not.toContain("must not enter");
    expect(download).not.toHaveBeenCalled();
    expect(warning).toHaveBeenCalledOnce();
    warning.mockRestore();
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
    expect(src).not.toMatch(/doGenerate|downloadProviderAssets|\.model\b/);
  });
});
