import { describe, expect, it, vi } from "vitest";
import { models } from "@grida/ai-models";
import { ModelCatalogStore } from "./model-catalog";
import { ProviderHttp } from "./http";
import { TRANSPARENT_PNG_BASE64 } from "../testing/transparent-png";
import type { SecretsStore } from "@grida/daemon/server";
import {
  defaultImageModelId,
  ImageModelUnavailableError,
  resolveImageModel,
} from "./resolve-image";
import { DEFAULT_IMAGE_MODEL_ID } from "./preferences";
import { GridaGatewaySessionStore } from "./gg-session";

/** Fake SecretsStore exposing only the `_getKey` the resolver uses. */
function fakeSecrets(keys: Record<string, string>): SecretsStore {
  return {
    _getKey: async (id: string) => keys[id] ?? null,
  } as unknown as SecretsStore;
}

// A universal listed card (binds vercel + fal + openrouter).
const LISTED = "openai/gpt-image-2";
// A kept-but-unlisted card (bfl/flux-kontext-max — not on OpenRouter).
const UNLISTED = "bfl/flux-kontext-max";
const GPT_IMAGE_2_5 = [
  "openai/gpt-image-2.5-flare",
  "openai/gpt-image-2.5-sunburst",
];

describe("defaultImageModelId", () => {
  it("is the explicit tracked pin (gpt-image-2), not catalog order", () => {
    // The default is a deliberate preference (see ./preferences), so it stays
    // gpt-image-2 regardless of how cards happen to sort in the catalog.
    expect(DEFAULT_IMAGE_MODEL_ID).toBe("openai/gpt-image-2");
    expect(defaultImageModelId()).toBe("openai/gpt-image-2");
  });
});

describe("resolveImageModel", () => {
  describe("native background requirements", () => {
    it.each(["opaque", "transparent"] as const)(
      "selects verified FAL for %s before OpenRouter or Vercel",
      async (background) => {
        const readKey = vi.fn<SecretsStore["_getKey"]>(
          async (id) => `key-${id}`
        );
        const r = await resolveImageModel(
          { secrets: { _getKey: readKey } as unknown as SecretsStore },
          LISTED,
          { background }
        );
        expect(r.provider_id).toBe("fal");
        expect(readKey.mock.calls).toEqual([["fal"]]);
      }
    );

    it.each(["vercel", "openrouter", "gg"] as const)(
      "explicit unsupported %s fails before I/O without fallback",
      async (explicit) => {
        const gg = new GridaGatewaySessionStore();
        gg.set({
          access_token: "test-token",
          expires_at: Date.now() + 900_000,
        });
        const readKey = vi.fn<SecretsStore["_getKey"]>(
          async () => "secret-do-not-reflect"
        );
        await expect(
          resolveImageModel(
            {
              secrets: { _getKey: readKey } as unknown as SecretsStore,
              gg,
              gg_base_url: "https://grida.test",
            },
            LISTED,
            { explicit, background: "transparent" }
          )
        ).rejects.toMatchObject({
          code: "image_model_unavailable",
          background: "transparent",
          provider_id: explicit,
        });
        expect(readKey).not.toHaveBeenCalled();
      }
    );

    it("cannot fall back to hosted GG for an unsupported explicit background", async () => {
      const gg = new GridaGatewaySessionStore();
      gg.set({ access_token: "test-token", expires_at: Date.now() + 900_000 });
      await expect(
        resolveImageModel(
          { secrets: fakeSecrets({}), gg, gg_base_url: "https://grida.test" },
          LISTED,
          { background: "transparent" }
        )
      ).rejects.toMatchObject({ background: "transparent" });
    });

    it("auto preserves ordinary provider precedence", async () => {
      const r = await resolveImageModel(
        { secrets: fakeSecrets({ openrouter: "or", fal: "fal" }) },
        LISTED,
        { background: "auto" }
      );
      expect(r.provider_id).toBe("openrouter");
    });

    it("does not confuse native background support with edit-route availability", async () => {
      await expect(
        resolveImageModel(
          { secrets: fakeSecrets({ openrouter: "or", fal: "fal" }) },
          LISTED,
          { background: "transparent", references: true }
        )
      ).rejects.toThrow(/transparent background and reference images/);
      for (const id of GPT_IMAGE_2_5) {
        const r = await resolveImageModel(
          { secrets: fakeSecrets({ fal: "fal" }) },
          id,
          { background: "transparent", references: true }
        );
        expect(r.binding_id).toMatch(/\/edit$/);
      }
    });

    it("does not infer controls from older published cards without capability metadata", async () => {
      const snapshot = structuredClone(
        models.snapshot.seed({ version: "old-capability" })
      );
      const card = snapshot.image!.models[LISTED]!;
      delete card.transparent_background;
      for (const binding of Object.values(card.providers ?? {})) {
        if (binding) delete binding.transparent_background;
      }
      const catalog = new ModelCatalogStore({
        base_url: "https://grida.test",
        fetch: async () => Response.json(snapshot),
      });
      expect(await catalog.refresh("boot")).toBe(true);
      await expect(
        resolveImageModel(
          { secrets: fakeSecrets({ fal: "fal" }), catalog },
          LISTED,
          { background: "transparent" }
        )
      ).rejects.toBeInstanceOf(ImageModelUnavailableError);
    });
  });

  it("resolves the only connected provider (one key serves the list)", async () => {
    const r = await resolveImageModel(
      { secrets: fakeSecrets({ fal: "sk-fal" }) },
      LISTED
    );
    expect(r.provider_id).toBe("fal");
    expect(r.model_id).toBe(LISTED);
    expect(r.binding_id).toBe("fal-ai/gpt-image-2");
    expect(r.model.provider).toBe("fal");
  });

  it("follows precedence when multiple keys exist (openrouter before fal)", async () => {
    const r = await resolveImageModel(
      { secrets: fakeSecrets({ fal: "sk-fal", openrouter: "sk-or" }) },
      LISTED
    );
    expect(r.provider_id).toBe("openrouter");
    expect(r.binding_id).toBe("openai/gpt-image-2");
  });

  it("honors an explicit provider pick", async () => {
    const r = await resolveImageModel(
      { secrets: fakeSecrets({ vercel: "sk-v", fal: "sk-fal" }) },
      LISTED,
      { explicit: "fal" }
    );
    expect(r.provider_id).toBe("fal");
  });

  it("throws when the explicit provider has no key", async () => {
    await expect(
      resolveImageModel({ secrets: fakeSecrets({ vercel: "sk-v" }) }, LISTED, {
        explicit: "fal",
      })
    ).rejects.toBeInstanceOf(ImageModelUnavailableError);
  });

  it("throws when no provider key is present", async () => {
    await expect(
      resolveImageModel({ secrets: fakeSecrets({}) }, LISTED)
    ).rejects.toBeInstanceOf(ImageModelUnavailableError);
  });

  it("rejects a non-listed card even with a matching key", async () => {
    // flux-kontext-max binds fal, but it's not in the curated v1 BYOK surface.
    await expect(
      resolveImageModel({ secrets: fakeSecrets({ fal: "sk-fal" }) }, UNLISTED)
    ).rejects.toBeInstanceOf(ImageModelUnavailableError);
  });

  it("rejects an unknown model id", async () => {
    await expect(
      resolveImageModel(
        { secrets: fakeSecrets({ fal: "sk-fal" }) },
        "nobody/nope"
      )
    ).rejects.toBeInstanceOf(ImageModelUnavailableError);
  });

  describe.each(GPT_IMAGE_2_5)("GPT Image 2.5 provider bindings: %s", (id) => {
    it.each(["vercel", "gg"] as const)(
      "delivers captured transparent PNG intent through the actual %s binding",
      async (explicit) => {
        const gg = new GridaGatewaySessionStore();
        gg.set({
          access_token: "hosted-token",
          expires_at: Date.now() + 900_000,
        });
        const request = vi.fn<typeof fetch>(async () =>
          Response.json(
            explicit === "vercel"
              ? { images: [TRANSPARENT_PNG_BASE64] }
              : {
                  model_id: id,
                  provider_id: "vercel",
                  images: [
                    { base64: TRANSPARENT_PNG_BASE64, media_type: "image/png" },
                  ],
                }
          )
        );
        const download = vi.fn<typeof fetch>();
        const resolved = await resolveImageModel(
          {
            secrets: fakeSecrets({ vercel: "vercel-key" }),
            gg,
            gg_base_url: "https://grida.test",
            provider_http: new ProviderHttp({ request, download }),
          },
          id,
          { explicit, background: "transparent" }
        );
        const generated = await resolved.model.doGenerate({
          prompt: "an isolated sticker",
          n: 1,
          size: "1536x1024",
          aspectRatio: undefined,
          seed: undefined,
          files: undefined,
          mask: undefined,
          providerOptions: {
            openai: {
              quality: "max",
              background: "opaque",
              output_format: "jpeg",
            },
            gg: { quality: "max", background: "opaque", output_format: "jpeg" },
          },
        });
        expect(generated.images).toEqual([TRANSPARENT_PNG_BASE64]);
        expect(request).toHaveBeenCalledOnce();
        expect(download).not.toHaveBeenCalled();
        const body = JSON.parse(String(request.mock.calls[0]?.[1]?.body));
        expect(String(request.mock.calls[0]?.[0])).toBe(
          explicit === "vercel"
            ? "https://ai-gateway.vercel.sh/v3/ai/image-model"
            : "https://grida.test/api/v1/ai/images/generations"
        );
        expect(
          new Headers(request.mock.calls[0]?.[1]?.headers).get("ai-model-id")
        ).toBe(explicit === "vercel" ? id : null);
        expect(body).toMatchObject(
          explicit === "vercel"
            ? {
                size: "1536x1024",
                providerOptions: {
                  openai: {
                    background: "transparent",
                    output_format: "png",
                    quality: "max",
                  },
                },
              }
            : {
                model_id: id,
                width: 1536,
                height: 1024,
                quality: "max",
                background: "transparent",
              }
        );
        expect(body).not.toHaveProperty("output_format");
      }
    );

    it("follows ordinary provider precedence when every provider is connected", async () => {
      const r = await resolveImageModel(
        {
          secrets: fakeSecrets({
            fal: "sk-fal",
            openrouter: "sk-or",
            vercel: "sk-v",
          }),
        },
        id
      );
      expect(r.provider_id).toBe("openrouter");
      expect(r.binding_id).toBe(id);
    });

    it.each(["vercel", "fal", "openrouter"] as const)(
      "resolves the exact binding with only %s connected",
      async (provider) => {
        const r = await resolveImageModel(
          { secrets: fakeSecrets({ [provider]: "key" }) },
          id
        );
        expect(r.provider_id).toBe(provider);
        expect(r.binding_id).toBe(
          provider === "fal"
            ? `${id.replace("2.5-", "2.5/")}/text-to-image`
            : id
        );
      }
    );

    it("selects Vercel for transparency before FAL while skipping OpenRouter", async () => {
      const r = await resolveImageModel(
        {
          secrets: fakeSecrets({
            openrouter: "or",
            vercel: "vercel",
            fal: "fal",
          }),
        },
        id,
        { background: "transparent" }
      );
      expect(r.provider_id).toBe("vercel");
      expect(r.binding_id).toBe(id);
    });

    it("preserves transparent edits on FAL when all providers are connected", async () => {
      const r = await resolveImageModel(
        {
          secrets: fakeSecrets({
            openrouter: "or",
            vercel: "vercel",
            fal: "fal",
          }),
        },
        id,
        { background: "transparent", references: true }
      );
      expect(r.provider_id).toBe("fal");
      expect(r.binding_id).toBe(`${id.replace("2.5-", "2.5/")}/edit`);
    });

    it("uses OpenRouter's same-ID reference route without claiming transparency", async () => {
      const r = await resolveImageModel(
        { secrets: fakeSecrets({ openrouter: "or" }) },
        id,
        { references: true }
      );
      expect(r.provider_id).toBe("openrouter");
      expect(r.binding_id).toBe(id);
      expect(r.references_max).toBe(16);
      await expect(
        resolveImageModel(
          { secrets: fakeSecrets({ openrouter: "or", fal: "fal" }) },
          id,
          { explicit: "openrouter", background: "transparent" }
        )
      ).rejects.toMatchObject({
        code: "image_model_unavailable",
        provider_id: "openrouter",
        background: "transparent",
      });
    });

    it("resolves the distinct edit route and reference cap", async () => {
      const r = await resolveImageModel(
        { secrets: fakeSecrets({ fal: "sk-fal" }) },
        id,
        { references: true }
      );
      expect(r.provider_id).toBe("fal");
      expect(r.binding_id).toBe(`${id.replace("2.5-", "2.5/")}/edit`);
      expect(r.references_max).toBe(16);
    });

    it.each([undefined, "gg"] as const)(
      "resolves transparent hosted generation with provider %s",
      async (explicit) => {
        const gg = new GridaGatewaySessionStore();
        gg.set({
          access_token: "test-token",
          expires_at: Date.now() + 900_000,
        });
        const resolved = await resolveImageModel(
          {
            secrets: fakeSecrets({ openrouter: "sk-or" }),
            gg,
            gg_base_url: "https://grida.test",
          },
          id,
          { explicit, background: "transparent" }
        );
        expect(resolved.provider_id).toBe("gg");
        expect(resolved.binding_id).toBe(id);
      }
    );

    it("withholds unverified Vercel and GG edit routes", async () => {
      await expect(
        resolveImageModel({ secrets: fakeSecrets({ vercel: "sk-v" }) }, id, {
          references: true,
        })
      ).rejects.toThrow(/reference images.*connect a key for: .*openrouter/is);
      const gg = new GridaGatewaySessionStore();
      gg.set({ access_token: "token", expires_at: Date.now() + 900_000 });
      await expect(
        resolveImageModel(
          {
            secrets: fakeSecrets({ fal: "fal" }),
            gg,
            gg_base_url: "https://grida.test",
          },
          id,
          { explicit: "gg", references: true, background: "transparent" }
        )
      ).rejects.toBeInstanceOf(ImageModelUnavailableError);
    });
  });

  describe("image-to-image (references)", () => {
    it("routes to a references-capable binding and reports the cap", async () => {
      // gpt-image-2's OpenRouter binding carries `references` (max 16); same id.
      const r = await resolveImageModel(
        { secrets: fakeSecrets({ openrouter: "sk-or" }) },
        LISTED,
        { references: true }
      );
      expect(r.provider_id).toBe("openrouter");
      expect(r.binding_id).toBe("openai/gpt-image-2");
      expect(r.references_max).toBe(16);
    });

    it("skips a t2i-only binding for a reference-bearing call", async () => {
      // gpt-image-2's fal binding has NO `references` → fal-only + references
      // must not silently route to a t2i route; no eligible provider → throws.
      await expect(
        resolveImageModel({ secrets: fakeSecrets({ fal: "sk-fal" }) }, LISTED, {
          references: true,
        })
      ).rejects.toBeInstanceOf(ImageModelUnavailableError);
    });

    it("names the i2i-capable provider(s) when an i2i resolution fails", async () => {
      // A fal-only user picks references → no fal i2i route. The error must tell
      // the agent WHICH key unlocks i2i (openrouter today), not a bare
      // "unavailable", so it can ask the user to connect the right provider.
      await expect(
        resolveImageModel({ secrets: fakeSecrets({ fal: "sk-fal" }) }, LISTED, {
          references: true,
        })
      ).rejects.toThrow(/reference images.*connect a key for: .*openrouter/is);
    });

    it("leaves references_max unset for a plain t2i resolution", async () => {
      const r = await resolveImageModel(
        { secrets: fakeSecrets({ openrouter: "sk-or" }) },
        LISTED
      );
      expect(r.references_max).toBeUndefined();
    });
  });
});
