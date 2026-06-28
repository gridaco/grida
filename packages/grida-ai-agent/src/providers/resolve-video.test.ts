import { describe, expect, it } from "vitest";
import type { SecretsStore } from "../secrets";
import { VideoModelUnavailableError, resolveVideoModel } from "./resolve-video";

function fakeSecrets(keys: Record<string, string>): SecretsStore {
  return {
    _getKey: async (id: string) => keys[id] ?? null,
  } as unknown as SecretsStore;
}

// Veo 3.1 binds vercel + fal; Seedance 2.0 binds vercel only.
const VEO = "google/veo-3.1";
const SEEDANCE = "bytedance/seedance-2.0";

describe("resolveVideoModel", () => {
  it("resolves a connected provider that serves the model", async () => {
    const r = await resolveVideoModel(
      { secrets: fakeSecrets({ fal: "sk-fal" }) },
      VEO
    );
    expect(r.provider_id).toBe("fal");
    expect(r.binding_id).toBe("fal-ai/veo3.1/image-to-video");
  });

  it("prefers Vercel (video precedence) when both keys exist", async () => {
    const r = await resolveVideoModel(
      { secrets: fakeSecrets({ vercel: "sk-v", fal: "sk-fal" }) },
      VEO
    );
    expect(r.provider_id).toBe("vercel");
    expect(r.binding_id).toBe("google/veo-3.1-generate-001");
  });

  it("falls through when the only key's provider does not serve the model", async () => {
    // Seedance has no fal binding — a fal-only user can't run it.
    await expect(
      resolveVideoModel({ secrets: fakeSecrets({ fal: "sk-fal" }) }, SEEDANCE)
    ).rejects.toBeInstanceOf(VideoModelUnavailableError);
  });

  it("resolves Seedance with a Vercel key", async () => {
    const r = await resolveVideoModel(
      { secrets: fakeSecrets({ vercel: "sk-v" }) },
      SEEDANCE
    );
    expect(r.provider_id).toBe("vercel");
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
      { explicit: "fal" }
    );
    expect(r.provider_id).toBe("fal");
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
