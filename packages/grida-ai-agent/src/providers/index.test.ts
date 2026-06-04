import { describe, expect, it } from "vitest";
import type { SecretsStore } from "../secrets";
import {
  MODEL_BY_TIER,
  ProviderUnavailableError,
  resolveProvider,
} from "./index";

function deps(keys: Record<string, string | null> = {}) {
  return {
    secrets: {
      _getKey: async (providerId: string) => keys[providerId] ?? null,
    } as SecretsStore,
  };
}

describe("resolveProvider", () => {
  it("prefers OpenRouter over AI Gateway when both BYOK keys exist", async () => {
    const provider = await resolveProvider(
      deps({
        openrouter: " sk-or ",
        "ai-gateway": "ai-gateway-key",
      })
    );

    expect(provider.provider_id).toBe("openrouter");
    expect(provider.kind).toBe("byok");
    expect(provider.model_factory).toBeTypeOf("function");
  });

  it("falls back to AI Gateway when OpenRouter is absent", async () => {
    const provider = await resolveProvider(
      deps({ "ai-gateway": "ai-gateway-key" })
    );

    expect(provider.provider_id).toBe("ai-gateway");
    expect(provider.kind).toBe("byok");
  });

  it("throws when no BYOK key is available", async () => {
    await expect(resolveProvider(deps())).rejects.toBeInstanceOf(
      ProviderUnavailableError
    );
  });

  it("throws when an explicit BYOK provider has no key", async () => {
    await expect(
      resolveProvider(deps({ openrouter: "sk-or" }), {
        explicit: "ai-gateway",
      })
    ).rejects.toMatchObject({ provider_id: "ai-gateway" });
  });

  it("BYOK factory honors an explicit modelId over the tier model", async () => {
    const provider = await resolveProvider(deps({ openrouter: "sk-or" }));
    expect(
      (provider.model_factory("nano") as { modelId: string }).modelId
    ).toBe(MODEL_BY_TIER.nano);

    const picked = provider.model_factory(
      "nano",
      "google/gemini-3.5-flash"
    ) as {
      modelId: string;
    };
    expect(picked.modelId).toBe("google/gemini-3.5-flash");
  });
});
