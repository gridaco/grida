import { describe, expect, it } from "vitest";
import type { SecretsStore } from "../secrets";
import { ImageModelUnavailableError, resolveImageModel } from "./resolve-image";

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

describe("resolveImageModel", () => {
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
});
