// GRIDA-SEC-008 — native-provider precedence and explicit availability pins.
import { describe, expect, it } from "vitest";
import type { SecretsStore } from "@grida/daemon/server";
import type { ChatGptCredentialManager } from "./chatgpt-credentials";
import type { ChatGptProviderConfig, ChatGptProviderRuntime } from "./chatgpt";
import { ProviderUnavailableError, resolveProvider } from "./index";

const CONFIG: ChatGptProviderConfig = {
  oauth: {
    authorize_url: "https://auth.example.test/oauth/authorize",
    token_url: "https://auth.example.test/oauth/token",
    client_id: "grida-test-client",
    redirect_uris: ["http://localhost:1455/auth/callback"],
    scopes: ["openid", "offline_access"],
  },
  responses_url: "https://chatgpt.example.test/backend-api/agent/responses",
  originator: "grida-test",
  default_model_id: "openai/gpt-5.6-terra",
};

describe("resolveProvider — native ChatGPT subscription", () => {
  it("uses a ready subscription first for a compatible model", async () => {
    const provider = await resolveProvider(
      deps({
        ready: true,
        openrouter: "byok-key",
      }),
      { model_id: "openai/gpt-5.6-terra" }
    );
    expect(provider).toMatchObject({
      provider_id: "chatgpt",
      kind: "chatgpt",
    });
  });

  it("falls through to BYOK when the selected model is not subscription-compatible", async () => {
    const provider = await resolveProvider(
      deps({
        ready: true,
        openrouter: "byok-key",
      }),
      { model_id: "anthropic/claude-sonnet-5" }
    );
    expect(provider).toMatchObject({
      provider_id: "openrouter",
      kind: "byok",
    });
  });

  it("fails an explicit chatgpt pick when signed out or model-incompatible", async () => {
    await expect(
      resolveProvider(deps({ ready: false }), {
        explicit: "chatgpt",
        model_id: "openai/gpt-5.6-terra",
      })
    ).rejects.toMatchObject({
      provider_id: "chatgpt",
      code: "provider_down",
    });
    await expect(
      resolveProvider(deps({ ready: true }), {
        explicit: "chatgpt",
        model_id: "anthropic/claude-sonnet-5",
      })
    ).rejects.toBeInstanceOf(ProviderUnavailableError);
  });

  it("keeps subscription-only ids pinned to ChatGPT when signed out", async () => {
    await expect(
      resolveProvider(
        deps({
          ready: false,
          openrouter: "byok-key",
        }),
        { model_id: "openai/gpt-5.4" }
      )
    ).rejects.toMatchObject({
      provider_id: "chatgpt",
      code: "provider_down",
    });
  });
});

function deps(options: { ready: boolean; openrouter?: string }): {
  secrets: SecretsStore;
  chatgpt: ChatGptProviderRuntime;
} {
  const credentials = {
    supportsAccount: async () => options.ready,
  } as unknown as ChatGptCredentialManager;
  return {
    secrets: {
      _getKey: async (id: string) =>
        id === "openrouter" ? (options.openrouter ?? null) : null,
    } as unknown as SecretsStore,
    chatgpt: { config: CONFIG, credentials },
  };
}
