/**
 * `/images/generate` route (#908) — bare Hono app, fake secrets, mocked
 * `generateImage`. No model, no network.
 */
import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Hono } from "hono";
import { generateImage } from "ai";
import type { MediaItem } from "@grida/daemon";
import type { MediaPersistence, SecretsStore } from "@grida/daemon/server";
import { registerImagesRoutes } from "./images";
import { TRANSPARENT_PNG_BASE64 } from "../../testing/transparent-png";
import { GridaGatewaySessionStore } from "../../providers/gg-session";

// Replace the `ai` SDK's generateImage so the route never drives a real model.
const generation = vi.hoisted(() => ({
  images: [] as Array<{ base64: string; mediaType: string }>,
}));
vi.mock("ai", () => ({
  generateImage: vi.fn<() => Promise<typeof generation>>(
    async () => generation
  ),
}));

beforeEach(() => {
  vi.mocked(generateImage).mockClear();
  generation.images = [{ base64: "AAAA", mediaType: "image/png" }];
});

function fakeSecrets(keys: Record<string, string>): SecretsStore {
  return {
    _getKey: async (id: string) => keys[id] ?? null,
  } as unknown as SecretsStore;
}

function appWith(
  keys: Record<string, string>,
  media?: MediaPersistence | null
) {
  const app = new Hono();
  registerImagesRoutes(app, { secrets: fakeSecrets(keys), media });
  return app;
}

function post(app: Hono, payload: unknown) {
  return app.request("/images/generate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
}

const LISTED = "openai/gpt-image-2";

describe("POST /images/generate", () => {
  describe.each([
    "openai/gpt-image-2.5-flare",
    "openai/gpt-image-2.5-sunburst",
  ])("GPT Image 2.5 model %s", (model_id) => {
    it.each(["auto", "xhigh", "max"])(
      "forwards %s quality through OpenRouter's verified binding",
      async (quality) => {
        const res = await post(appWith({ openrouter: "key" }), {
          model_id,
          prompt: "x",
          quality,
        });
        expect(res.status).toBe(200);
        expect(await res.json()).toMatchObject({
          provider_id: "openrouter",
          model_id,
        });
        expect(generateImage).toHaveBeenCalledWith(
          expect.objectContaining({
            providerOptions: { openrouter: { quality } },
          })
        );
      }
    );

    it.each(["vercel", "gg"] as const)(
      "admits transparent %s generation while preserving advanced quality",
      async (provider) => {
        const gg = new GridaGatewaySessionStore();
        gg.set({
          access_token: "test-token",
          expires_at: Date.now() + 900_000,
        });
        const app = new Hono();
        registerImagesRoutes(app, {
          secrets: fakeSecrets({ vercel: "key" }),
          gg,
          gg_base_url: "https://grida.test",
        });
        const res = await post(app, {
          model_id,
          provider,
          prompt: "x",
          quality: "max",
          background: "transparent",
        });
        expect(res.status).toBe(200);
        expect(await res.json()).toMatchObject({
          provider_id: provider,
          model_id,
        });
        expect(generateImage).toHaveBeenCalledWith(
          expect.objectContaining({
            providerOptions: {
              [provider === "vercel" ? "openai" : "gg"]: { quality: "max" },
            },
          })
        );
      }
    );

    it("rejects explicit OpenRouter transparency without falling back to Vercel or FAL", async () => {
      const res = await post(
        appWith({ openrouter: "or", vercel: "vercel", fal: "fal" }),
        {
          model_id,
          provider: "openrouter",
          prompt: "x",
          background: "transparent",
        }
      );
      expect(res.status).toBe(400);
      expect(generateImage).not.toHaveBeenCalled();
    });
  });

  it.each(["checkerboard", "", null, false])(
    "rejects malformed background %s before generation",
    async (background) => {
      const res = await post(appWith({ fal: "sk-fal" }), {
        model_id: LISTED,
        prompt: "x",
        background,
      });
      expect(res.status).toBe(400);
      expect(generateImage).not.toHaveBeenCalled();
    }
  );

  it.each(["vercel", "openrouter", "gg"])(
    "rejects unsupported %s without generating or exposing secrets",
    async (provider) => {
      const gg = new GridaGatewaySessionStore();
      gg.set({
        access_token: "private-hosted-token",
        expires_at: Date.now() + 900_000,
      });
      const app = new Hono();
      registerImagesRoutes(app, {
        secrets: fakeSecrets({
          fal: "private-fal-key",
          vercel: "private-vercel-key",
          openrouter: "private-or-key",
        }),
        gg,
        gg_base_url: "https://grida.test",
      });
      const res = await post(app, {
        model_id: LISTED,
        provider,
        prompt: "secret-prompt",
        background: "transparent",
      });
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body).toMatchObject({
        code: "image_model_unavailable",
        model_id: LISTED,
      });
      expect(JSON.stringify(body)).toContain("transparent");
      expect(JSON.stringify(body)).not.toMatch(/private-|secret-prompt/);
      expect(generateImage).not.toHaveBeenCalled();
    }
  );

  it("selects FAL for transparent output and preserves alpha bytes through response and storage", async () => {
    generation.images = [
      { base64: TRANSPARENT_PNG_BASE64, mediaType: "image/png" },
    ];
    const save = vi
      .fn<MediaPersistence["save"]>()
      .mockRejectedValue(new Error("unavailable"));
    const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const res = await post(
        appWith({ fal: "fal", vercel: "vercel", openrouter: "or" }, { save }),
        {
          model_id: LISTED,
          prompt: "a transparent sticker",
          background: "transparent",
        }
      );
      expect(res.status).toBe(200);
      expect(await res.json()).toMatchObject({
        provider_id: "fal",
        images: [{ base64: TRANSPARENT_PNG_BASE64, media_type: "image/png" }],
      });
      expect(save).toHaveBeenCalledWith({
        file_name: "image-1.png",
        media_type: "image/png",
        bytes: Buffer.from(TRANSPARENT_PNG_BASE64, "base64"),
      });
    } finally {
      warning.mockRestore();
    }
  });

  it.each([undefined, "auto"] as const)(
    "preserves ordinary precedence for background %s",
    async (background) => {
      const res = await post(appWith({ fal: "fal", openrouter: "or" }), {
        model_id: LISTED,
        prompt: "x",
        background,
      });
      expect(res.status).toBe(200);
      expect(await res.json()).toMatchObject({ provider_id: "openrouter" });
    }
  );

  it("uses the native OpenAI namespace for Gateway quality", async () => {
    const res = await post(appWith({ vercel: "key" }), {
      model_id: LISTED,
      prompt: "x",
      quality: "high",
    });
    expect(res.status).toBe(200);
    expect(generateImage).toHaveBeenCalledWith(
      expect.objectContaining({
        providerOptions: { openai: { quality: "high" } },
      })
    );
  });

  it("200 + image bytes for a listed model with a connected key", async () => {
    const res = await post(appWith({ fal: "sk-fal" }), {
      model_id: LISTED,
      prompt: "a red apple",
    });
    expect(res.status).toBe(200);
    const json = (await res.json()) as Record<string, unknown>;
    expect(json.provider_id).toBe("fal");
    expect(json.model_id).toBe(LISTED);
    expect(json.images).toEqual([{ base64: "AAAA", media_type: "image/png" }]);
  });

  it("400 for an unknown model id", async () => {
    const res = await post(appWith({ fal: "sk-fal" }), {
      model_id: "nobody/nope",
      prompt: "x",
    });
    expect(res.status).toBe(400);
  });

  it("400 when no provider key is connected", async () => {
    const res = await post(appWith({}), { model_id: LISTED, prompt: "x" });
    expect(res.status).toBe(400);
  });

  it("400 on a malformed body (missing prompt)", async () => {
    const res = await post(appWith({ fal: "sk-fal" }), { model_id: LISTED });
    expect(res.status).toBe(400);
  });

  it("honors an explicit provider pick", async () => {
    const res = await post(appWith({ vercel: "sk-v", openrouter: "sk-or" }), {
      model_id: LISTED,
      prompt: "x",
      provider: "vercel",
    });
    expect(res.status).toBe(200);
    expect(((await res.json()) as Record<string, unknown>).provider_id).toBe(
      "vercel"
    );
  });

  it.each(["auto", "xhigh", "max"])(
    "forwards GPT Image 2.5 quality %s to FAL",
    async (quality) => {
      const res = await post(appWith({ fal: "sk-fal" }), {
        model_id: "openai/gpt-image-2.5-sunburst",
        prompt: "a detailed landscape",
        quality,
        width: 1536,
        height: 1024,
      });
      expect(res.status).toBe(200);
      expect(vi.mocked(generateImage)).toHaveBeenCalledWith(
        expect.objectContaining({
          size: "1536x1024",
          providerOptions: { fal: { quality } },
        })
      );
    }
  );

  it("never returns the api key in the response", async () => {
    const res = await post(appWith({ fal: "sk-secret-123" }), {
      model_id: LISTED,
      prompt: "x",
    });
    expect(await res.text()).not.toContain("sk-secret-123");
  });

  it("offers every output to the host store and correlates only accepted descriptors", async () => {
    generation.images = [
      { base64: "Zmlyc3Q=", mediaType: "image/png" },
      { base64: "c2Vjb25k", mediaType: "image/webp" },
    ];
    const stored: MediaItem = {
      id: "7ccb8e68-a201-40d9-a793-44de9e6c6fc6",
      file_name: "image-1.png",
      media_type: "image/png",
      byte_size: 5,
      created_at: 1,
    };
    const save = vi.fn<MediaPersistence["save"]>();
    save.mockResolvedValueOnce(stored);
    save.mockRejectedValueOnce(new Error("media-full"));
    const warning = vi.spyOn(console, "warn").mockImplementation(() => {});

    const res = await post(appWith({ fal: "sk-fal" }, { save }), {
      model_id: LISTED,
      prompt: "must not enter storage",
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      images: [
        {
          base64: "Zmlyc3Q=",
          media_type: "image/png",
          stored_media: stored,
        },
        { base64: "c2Vjb25k", media_type: "image/webp" },
      ],
    });
    expect(save).toHaveBeenNthCalledWith(1, {
      file_name: "image-1.png",
      media_type: "image/png",
      bytes: Buffer.from("first"),
    });
    expect(save).toHaveBeenNthCalledWith(2, {
      file_name: "image-2.webp",
      media_type: "image/webp",
      bytes: Buffer.from("second"),
    });
    expect(JSON.stringify(save.mock.calls)).not.toContain("must not enter");
    expect(warning).toHaveBeenCalledOnce();
    warning.mockRestore();
  });
});

// Phase 4 (#908) — the BYOK path must never enter the web Grida-billed seam.
describe("images route billing isolation", () => {
  const src = readFileSync(new URL("./images.ts", import.meta.url), "utf8");

  it("does not import the web billing server", () => {
    // Match an actual import/require, not the prose mention in the docblock.
    expect(src).not.toMatch(/(from|require\()\s*["'][^"']*editor\/lib\/ai/);
  });

  it("never sets the `grida` provider-option (the billing trigger)", () => {
    // The route MAY set providerOptions keyed by the image provider (e.g. for
    // quality), but never a literal `grida: { … }` — that's the field the web
    // billing middleware keys on. Image providers are vercel/fal/openrouter.
    // (Prose mentions of `providerOptions.grida` in the docblock are fine;
    // assert only an actual object-literal key.)
    expect(src).not.toMatch(/grida\s*:\s*\{/);
  });
});
