import { describe, expect, it } from "vitest";
import type { SecretsStore } from "@grida/daemon/server";
import { VideoModelUnavailableError, resolveVideoModel } from "./resolve-video";

function fakeSecrets(keys: Record<string, string>): SecretsStore {
  return {
    _getKey: async (id: string) => keys[id] ?? null,
  } as unknown as SecretsStore;
}

// Veo 3.1 binds vercel + fal; Seedance 2.0 binds fal + openrouter but NOT
// vercel — the gateway meters it per token, which the catalogue cannot price.
const VEO = "google/veo-3.1";
const SEEDANCE = "bytedance/seedance-2.0";

describe("resolveVideoModel", () => {
  it("resolves a connected provider that serves the model", async () => {
    const r = await resolveVideoModel(
      { secrets: fakeSecrets({ fal: "sk-fal" }) },
      VEO,
      { image: true }
    );
    expect(r.provider_id).toBe("fal");
    expect(r.binding_id).toBe("fal-ai/veo3.1/image-to-video");
    expect(r.input).toBe("image");
    expect(r).not.toHaveProperty("model");
    expect(Object.isFrozen(r)).toBe(true);
  });

  it("prefers Vercel over fal when both keys exist", async () => {
    const r = await resolveVideoModel(
      { secrets: fakeSecrets({ vercel: "sk-v", fal: "sk-fal" }) },
      VEO
    );
    expect(r.provider_id).toBe("vercel");
    expect(r.binding_id).toBe("google/veo-3.1-generate-001");
  });

  it("falls through when the only key's provider does not serve the model", async () => {
    // Seedance has no vercel binding — a Vercel-only user can't run it.
    await expect(
      resolveVideoModel({ secrets: fakeSecrets({ vercel: "sk-v" }) }, SEEDANCE)
    ).rejects.toBeInstanceOf(VideoModelUnavailableError);
  });

  it("resolves Seedance with a fal key", async () => {
    const r = await resolveVideoModel(
      { secrets: fakeSecrets({ fal: "sk-fal" }) },
      SEEDANCE,
      { image: true }
    );
    expect(r.provider_id).toBe("fal");
    expect(r.binding_id).toBe("bytedance/seedance-2.0/image-to-video");
  });

  it("resolves Veo and Seedance with an OpenRouter key", async () => {
    const veo = await resolveVideoModel(
      { secrets: fakeSecrets({ openrouter: "sk-or" }) },
      VEO
    );
    expect(veo.provider_id).toBe("openrouter");
    expect(veo.binding_id).toBe("google/veo-3.1");
    const seedance = await resolveVideoModel(
      { secrets: fakeSecrets({ openrouter: "sk-or" }) },
      SEEDANCE
    );
    expect(seedance.provider_id).toBe("openrouter");
  });

  it("honors an explicit provider pick", async () => {
    const r = await resolveVideoModel(
      { secrets: fakeSecrets({ vercel: "sk-v", fal: "sk-fal" }) },
      VEO,
      { explicit: "fal", image: true }
    );
    expect(r.provider_id).toBe("fal");
  });

  it("retains automatic OpenRouter precedence among compatible connected providers", async () => {
    const resolved = await resolveVideoModel(
      {
        secrets: fakeSecrets({
          openrouter: "key-or",
          vercel: "key-v",
          fal: "key-f",
        }),
      },
      VEO
    );
    expect(resolved.provider_id).toBe("openrouter");
    expect(resolved.input).toBe("text-or-image");
  });

  it("rejects text input on an image-only binding", async () => {
    await expect(
      resolveVideoModel({ secrets: fakeSecrets({ fal: "key" }) }, VEO, {
        explicit: "fal",
      })
    ).rejects.toBeInstanceOf(VideoModelUnavailableError);
  });

  it("throws with no key", async () => {
    await expect(
      resolveVideoModel({ secrets: fakeSecrets({}) }, VEO)
    ).rejects.toBeInstanceOf(VideoModelUnavailableError);
  });

  it("rejects an unknown model id", async () => {
    await expect(
      resolveVideoModel({ secrets: fakeSecrets({ vercel: "sk-v" }) }, "x/y")
    ).rejects.toBeInstanceOf(VideoModelUnavailableError);
  });
});
