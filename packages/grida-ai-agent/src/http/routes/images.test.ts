// GRIDA-SEC-004 / GRIDA-SEC-006 — real shared image operation, synthetic host transport.
// GRIDA-GG: provider — preserve the host's actionable GG response contract.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { Hono } from "hono";
import { ggContractFixture } from "../../../../grida-ai/src/testing/gg-contract";
import { GridaGatewaySessionStore, ProviderHttp } from "@grida/ai";
import type { MediaItem } from "@grida/daemon";
import type { MediaPersistence, SecretsStore } from "@grida/daemon/server";
import { registerImagesRoutes } from "./images";
import { TRANSPARENT_PNG_BASE64 } from "../../testing/transparent-png";

const PNG =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=";
const LISTED = "openai/gpt-image-2";
const RETAINED_IMAGE_TYPE = "application/vnd.grida.retained-image+json";

function imageCredential(key: string) {
  const nonce = "7ccb8e68a20140d9a79344de9e6c6fc6";
  return {
    nonce,
    proof: createHash("sha256")
      .update(`grida-desktop-image-key-v1\0${nonce}\0${key}`)
      .digest("hex"),
  };
}

function appWith(
  options: {
    keys?: Record<string, string>;
    get?: (id: string) => Promise<string | null>;
    media?: MediaPersistence | null;
    gg?: GridaGatewaySessionStore;
    request?: typeof globalThis.fetch;
  } = {}
) {
  const request = vi.fn<typeof globalThis.fetch>(
    options.request ??
      (async () => Response.json({ data: [{ b64_json: PNG }] }))
  );
  const metadata = ggContractFixture(
    [LISTED, "openai/gpt-image-2.5-flare", "openai/gpt-image-2.5-sunburst"].map(
      (id) => ({ id, kind: "image" as const })
    )
  );
  const download = vi.fn<typeof globalThis.fetch>();
  const app = new Hono();
  registerImagesRoutes(app, {
    secrets: {
      _getKey:
        options.get ?? (async (id: string) => options.keys?.[id] ?? null),
    } as unknown as SecretsStore,
    media: options.media,
    gg: options.gg,
    gg_base_url: options.gg ? "https://grida.test" : undefined,
    provider_http: new ProviderHttp({
      request: async (url, init) =>
        metadata.response(url) ?? request(url, init),
      download,
    }),
  });
  return { app, request, download };
}

function post(app: Hono, payload: unknown, accept?: string) {
  return app.request("/images/generate", {
    method: "POST",
    headers: { "content-type": "application/json", ...(accept && { accept }) },
    body: JSON.stringify(payload),
  });
}

describe("POST /images/generate", () => {
  it("keeps a bounded retained-image response separate from the normal bytes response", async () => {
    const stored: MediaItem = {
      id: "7ccb8e68-a201-40d9-a793-44de9e6c6fc6",
      file_name: "image-1.png",
      media_type: "image/png",
      byte_size: Buffer.from(PNG, "base64").length,
      created_at: 1,
    };
    const save = vi.fn<MediaPersistence["save"]>().mockResolvedValue(stored);
    const { app, request } = appWith({
      keys: { openrouter: "key" },
      media: { save },
    });
    const payload = {
      model_id: LISTED,
      binding_id: LISTED,
      prompt: "a test image",
      provider: "openrouter",
      credential: imageCredential("key"),
    };
    for (const change of [
      { references: [] },
      { n: 2 },
      { provider: "gg" },
      { binding_id: "changed" },
    ]) {
      expect(
        (await post(app, { ...payload, ...change }, RETAINED_IMAGE_TYPE)).status
      ).toBe(400);
    }
    expect(request).not.toHaveBeenCalled();
    const response = await post(app, payload, RETAINED_IMAGE_TYPE);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      model_id: LISTED,
      provider_id: "openrouter",
      stored_media: stored,
    });
    expect(request).toHaveBeenCalledOnce();
    expect(save).toHaveBeenCalledWith({
      file_name: "image-1.png",
      media_type: "image/png",
      bytes: Uint8Array.from(Buffer.from(PNG, "base64")),
    });
    expect(await (await post(app, payload)).json()).toMatchObject({
      images: [{ base64: PNG, media_type: "image/png", stored_media: stored }],
    });
    // The SDK identifies a BMP signature, which remains a supported Tools
    // output but is outside the retained-only agent receipt contract.
    request.mockResolvedValueOnce(
      Response.json({ data: [{ b64_json: "Qk0AAAAAAAAAAAAA" }] })
    );
    const unsupported = await post(app, payload, RETAINED_IMAGE_TYPE);
    expect(unsupported.status).toBe(200);
    expect(await unsupported.json()).toMatchObject({ stored_media: null });
    expect(save).toHaveBeenCalledTimes(2);
  });

  it("refuses a changed provider key during resolution or immediately before dispatch", async () => {
    for (const keys of [["changed"], [" original ", "changed"]]) {
      const get = vi.fn<(id: string) => Promise<string | null>>();
      for (const key of keys) get.mockResolvedValueOnce(key);
      const { app, request } = appWith({ get });
      const response = await post(
        app,
        {
          model_id: LISTED,
          binding_id: LISTED,
          prompt: "a test image",
          provider: "openrouter",
          credential: imageCredential("original"),
        },
        RETAINED_IMAGE_TYPE
      );
      expect(response.status).toBe(400);
      expect(get.mock.calls).toEqual(keys.map(() => ["openrouter"]));
      expect(request).not.toHaveBeenCalled();
      expect(await response.text()).not.toMatch(/original|changed|proof|nonce/);
    }
  });

  it("returns a safe server failure when credential access breaks during resolution", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const { app, request } = appWith({
        get: async () => {
          throw new Error("private-key-reader-detail");
        },
      });
      const res = await post(app, { model_id: LISTED, prompt: "x" });
      expect(res.status).toBe(502);
      expect(await res.json()).toEqual({
        error: "image generation failed",
        model_id: LISTED,
      });
      expect(request).not.toHaveBeenCalled();
      expect(logged).not.toHaveBeenCalled();
    } finally {
      logged.mockRestore();
    }
  });

  it("uses the public operation and preserves the host wire and provider options", async () => {
    const { app, request, download } = appWith({
      keys: { openrouter: "synthetic-key" },
    });
    const res = await post(app, {
      model_id: LISTED,
      prompt: "a red apple",
      width: 512.2,
      height: 768.4,
      aspect_ratio: "2:3",
      n: 1,
      seed: 7,
      quality: "high",
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      model_id: LISTED,
      provider_id: "openrouter",
      images: [{ base64: PNG, media_type: "image/png" }],
    });
    expect(request).toHaveBeenCalledOnce();
    const [url, init] = request.mock.calls[0];
    expect(String(url)).toBe("https://openrouter.ai/api/v1/images");
    expect(new Headers(init?.headers).get("authorization")).toBe(
      "Bearer synthetic-key"
    );
    expect(JSON.parse(String(init?.body))).toEqual({
      model: LISTED,
      prompt: "a red apple",
      size: "512x768",
      aspect_ratio: "2:3",
      n: 1,
      seed: 7,
      quality: "high",
    });
    expect(download).not.toHaveBeenCalled();
  });

  it.each([
    [{ model_id: "nobody/nope", prompt: "x" }, { openrouter: "key" }],
    [{ model_id: LISTED, prompt: "x" }, {}],
    [{ model_id: LISTED }, { openrouter: "key" }],
    [{ model_id: LISTED, prompt: "x", provider: "fal" }, { openrouter: "key" }],
    [{ model_id: LISTED, prompt: "x", n: 0 }, { openrouter: "key" }],
  ])(
    "rejects unavailable or invalid input before provider I/O",
    async (payload, keys) => {
      const { app, request } = appWith({ keys });
      expect((await post(app, payload)).status).toBe(400);
      expect(request).not.toHaveBeenCalled();
    }
  );

  it("honors an explicit provider instead of the connected-provider precedence", async () => {
    const gg = new GridaGatewaySessionStore();
    gg.set({ access_token: "synthetic-gg", expires_at: Date.now() + 900_000 });
    const { app, request } = appWith({
      keys: { openrouter: "key" },
      gg,
      request: async () =>
        Response.json({ data: [{ b64_json: PNG, media_type: "image/png" }] }),
    });
    const res = await post(app, {
      model_id: LISTED,
      prompt: "x",
      provider: "gg",
      quality: "medium",
    });
    expect(res.status).toBe(200);
    expect((await res.json()).provider_id).toBe("gg");
    expect(String(request.mock.calls[0][0])).toBe(
      "https://grida.test/api/v1/ai/operations"
    );
    expect(
      JSON.parse(String(request.mock.calls[0][1]?.body)).input.quality
    ).toBe("medium");
  });

  it("offers each output to host persistence and attaches only accepted receipts", async () => {
    const stored: MediaItem = {
      id: "7ccb8e68-a201-40d9-a793-44de9e6c6fc6",
      file_name: "image-1.png",
      media_type: "image/png",
      byte_size: Buffer.from(PNG, "base64").length,
      created_at: 1,
    };
    const save = vi.fn<MediaPersistence["save"]>();
    save
      .mockResolvedValueOnce(stored)
      .mockRejectedValueOnce(new Error("media-full"));
    const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const { app } = appWith({
        keys: { openrouter: "key" },
        media: { save },
        request: async () =>
          Response.json({ data: [{ b64_json: PNG }, { b64_json: PNG }] }),
      });
      const res = await post(app, {
        model_id: LISTED,
        prompt: "never stored",
        n: 2,
      });
      expect(res.status).toBe(200);
      expect((await res.json()).images).toEqual([
        { base64: PNG, media_type: "image/png", stored_media: stored },
        { base64: PNG, media_type: "image/png" },
      ]);
      for (let index = 0; index < 2; index++)
        expect(save).toHaveBeenNthCalledWith(index + 1, {
          file_name: `image-${index + 1}.png`,
          media_type: "image/png",
          bytes: Buffer.from(PNG, "base64"),
        });
      expect(JSON.stringify(save.mock.calls)).not.toContain("never stored");
      expect(warning).toHaveBeenCalledOnce();
    } finally {
      warning.mockRestore();
    }
  });

  it("never logs or returns upstream detail and never retries a failed paid request", async () => {
    const sentinel = "synthetic-secret-prompt-upstream-body";
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const { app, request } = appWith({
        keys: { openrouter: sentinel },
        request: async () => {
          throw Object.assign(new Error(sentinel), { responseBody: sentinel });
        },
      });
      const res = await post(app, { model_id: LISTED, prompt: sentinel });
      expect(res.status).toBe(502);
      expect(await res.text()).not.toContain(sentinel);
      expect(JSON.stringify(logged.mock.calls)).not.toContain(sentinel);
      expect(request).toHaveBeenCalledOnce();
    } finally {
      logged.mockRestore();
    }
  });

  it.each([
    [401, "gg_token_expired"],
    [402, "insufficient_credits"],
  ] as const)("preserves actionable GG HTTP %s", async (status, code) => {
    const gg = new GridaGatewaySessionStore();
    gg.set({ access_token: "synthetic-gg", expires_at: Date.now() + 900_000 });
    const { app, request } = appWith({
      gg,
      request: async () => new Response("private-upstream", { status }),
    });
    const res = await post(app, {
      model_id: LISTED,
      prompt: "x",
      provider: "gg",
    });
    expect(res.status).toBe(status);
    expect(await res.json()).toMatchObject({ code, provider_id: "gg" });
    expect(request).toHaveBeenCalledOnce();
  });
});

describe("images route billing isolation", () => {
  const src = readFileSync(new URL("./images.ts", import.meta.url), "utf8");
  it("delegates execution without importing the web billing server", () => {
    expect(src).not.toMatch(/(from|require\()\s*["'][^"']*editor\/lib\/ai/);
    expect(src).not.toMatch(/grida\s*:\s*\{/);
    expect(src).not.toMatch(/generateImage|\.model\b/);
  });
});

describe.each(["openai/gpt-image-2.5-flare", "openai/gpt-image-2.5-sunburst"])(
  "GPT Image 2.5 route %s",
  (model_id) => {
    it.each(["auto", "xhigh", "max"])(
      "forwards %s quality through OpenRouter",
      async (quality) => {
        const { app, request } = appWith({ keys: { openrouter: "key" } });
        expect(
          (await post(app, { model_id, prompt: "x", quality })).status
        ).toBe(200);
        expect(
          JSON.parse(String(request.mock.calls[0]?.[1]?.body))
        ).toMatchObject({ quality });
      }
    );

    it.each(["vercel", "gg"] as const)(
      "preserves actual transparent PNG bytes and quality through %s",
      async (provider) => {
        const gg = new GridaGatewaySessionStore();
        gg.set({
          access_token: "test-token",
          expires_at: Date.now() + 900_000,
        });
        const save = vi.fn<MediaPersistence["save"]>().mockResolvedValue({
          id: "7ccb8e68-a201-40d9-a793-44de9e6c6fc6",
          file_name: "image-1.png",
          media_type: "image/png",
          byte_size: Buffer.from(TRANSPARENT_PNG_BASE64, "base64").length,
          created_at: 1,
        });
        const { app, request, download } = appWith({
          keys: { vercel: "key" },
          gg,
          media: { save },
          request: async () =>
            Response.json(
              provider === "vercel"
                ? { images: [TRANSPARENT_PNG_BASE64] }
                : {
                    data: [
                      {
                        b64_json: TRANSPARENT_PNG_BASE64,
                        media_type: "image/png",
                      },
                    ],
                  }
            ),
        });
        const res = await post(app, {
          model_id,
          provider,
          prompt: "isolated sticker",
          quality: "max",
          background: "transparent",
        });
        expect(res.status).toBe(200);
        expect(await res.json()).toMatchObject({
          model_id,
          provider_id: provider,
          images: [{ base64: TRANSPARENT_PNG_BASE64, media_type: "image/png" }],
        });
        expect(save).toHaveBeenCalledWith({
          file_name: "image-1.png",
          media_type: "image/png",
          bytes: Buffer.from(TRANSPARENT_PNG_BASE64, "base64"),
        });
        expect(
          JSON.parse(String(request.mock.calls[0]?.[1]?.body))
        ).toMatchObject(
          provider === "vercel"
            ? {
                providerOptions: {
                  openai: {
                    quality: "max",
                    background: "transparent",
                    output_format: "png",
                  },
                },
              }
            : { input: { quality: "max", background: "transparent" } }
        );
        expect(request).toHaveBeenCalledOnce();
        expect(download).not.toHaveBeenCalled();
      }
    );

    it.each(["checkerboard", ""])(
      "rejects invalid OpenRouter background %s before provider I/O",
      async (background) => {
        const { app, request } = appWith({
          keys: { openrouter: "key", fal: "key" },
        });
        const res = await post(app, {
          model_id,
          provider: "openrouter",
          prompt: "x",
          background,
        });
        expect(res.status).toBe(400);
        expect(request).not.toHaveBeenCalled();
      }
    );
  }
);
