import { describe, expect, it } from "vitest";
import type { SecretsStore } from "../secrets";
import type { EndpointProviderConfig } from "../protocol/endpoints";
import type { EndpointProvidersStore } from "./endpoints";
import {
  MODEL_BY_TIER,
  ProviderUnavailableError,
  resolveProvider,
} from "./index";

function deps(
  keys: Record<string, string | null> = {},
  endpoints?: EndpointProviderConfig[]
) {
  return {
    secrets: {
      _getKey: async (providerId: string) => keys[providerId] ?? null,
    } as SecretsStore,
    endpoints: endpoints
      ? ({
          list: async () => endpoints,
          get: async (id: string) => endpoints.find((e) => e.id === id) ?? null,
        } as EndpointProvidersStore)
      : undefined,
  };
}

const OLLAMA: EndpointProviderConfig = {
  id: "ollama",
  label: "Ollama",
  base_url: "http://localhost:11434/v1",
  models: [{ id: "llama3.1:8b" }, { id: "qwen3:32b" }],
};

describe("resolveProvider", () => {
  it("prefers OpenRouter over Vercel when both BYOK keys exist", async () => {
    const provider = await resolveProvider(
      deps({
        openrouter: " sk-or ",
        vercel: "vercel-key",
      })
    );

    expect(provider.provider_id).toBe("openrouter");
    expect(provider.kind).toBe("byok");
    expect(provider.model_factory).toBeTypeOf("function");
  });

  it("falls back to Vercel when OpenRouter is absent", async () => {
    const provider = await resolveProvider(deps({ vercel: "vercel-key" }));

    expect(provider.provider_id).toBe("vercel");
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
        explicit: "vercel",
      })
    ).rejects.toMatchObject({ provider_id: "vercel" });
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

describe("resolveProvider — endpoint providers (issue #806)", () => {
  it("resolves a configured endpoint with NO key (the no-signup path)", async () => {
    const provider = await resolveProvider(deps({}, [OLLAMA]));
    expect(provider.provider_id).toBe("ollama");
    expect(provider.kind).toBe("endpoint");
  });

  it("BYOK keys take precedence over configured endpoints", async () => {
    const provider = await resolveProvider(
      deps({ openrouter: "sk-or" }, [OLLAMA])
    );
    expect(provider.provider_id).toBe("openrouter");
  });

  it("an explicit endpoint pick skips BYOK precedence", async () => {
    const provider = await resolveProvider(
      deps({ openrouter: "sk-or" }, [OLLAMA]),
      { explicit: "ollama" }
    );
    expect(provider.provider_id).toBe("ollama");
    expect(provider.kind).toBe("endpoint");
  });

  it("an endpoint with no registered models is not resolvable", async () => {
    const empty = { ...OLLAMA, models: [] };
    await expect(resolveProvider(deps({}, [empty]))).rejects.toBeInstanceOf(
      ProviderUnavailableError
    );
    await expect(
      resolveProvider(deps({}, [empty]), { explicit: "ollama" })
    ).rejects.toMatchObject({ provider_id: "ollama" });
  });

  it("an unknown explicit provider id throws with the picked id", async () => {
    await expect(
      resolveProvider(deps({}, [OLLAMA]), { explicit: "nope" })
    ).rejects.toMatchObject({ provider_id: "nope" });
  });

  it("every tier maps to the endpoint's default model; explicit ids pass through", async () => {
    const provider = await resolveProvider(deps({}, [OLLAMA]));
    // No default_model_id configured → models[0]. The titler/compactor
    // ask for `nano`; on an endpoint that must land on a served model,
    // never the catalog tier id.
    for (const tier of ["nano", "mini", "pro", "max"] as const) {
      expect(
        (provider.model_factory(tier) as { modelId: string }).modelId
      ).toBe("llama3.1:8b");
    }
    expect(
      (provider.model_factory("pro", "qwen3:32b") as { modelId: string })
        .modelId
    ).toBe("qwen3:32b");
  });

  it("honors an explicit default_model_id", async () => {
    const provider = await resolveProvider(
      deps({}, [{ ...OLLAMA, default_model_id: "qwen3:32b" }])
    );
    expect((provider.model_factory("pro") as { modelId: string }).modelId).toBe(
      "qwen3:32b"
    );
  });
});
