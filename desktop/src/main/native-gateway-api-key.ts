// GRIDA-SEC-004 / GRIDA-SEC-014 / GRIDA-GG: desktop — standalone key custody.
import { createHash, randomUUID } from "node:crypto";
import { ProviderCredentialStore } from "@grida/auth/providers";
import { DESKTOP_GG_API_KEY_PROVIDER_ID } from "@grida/ai/providers";
import type { GGModelsView } from "@grida/ai-host";
import { ProviderNetworkPolicy } from "../provider-network-policy";
import { NativeChatProfiles } from "./native-chat-profiles";
import type { NativeProviderNetwork } from "./native-provider-egress";

export class NativeGatewayApiKey {
  // The shared credential slot is gg. This id identifies a Desktop chat
  // connection, independently of the signed-in Gateway's saved profiles.
  static readonly providerId = DESKTOP_GG_API_KEY_PROVIDER_ID;
  static readonly label = "Grida Gateway · API key";
  static readonly credentialId = "gg";

  private readonly store: ProviderCredentialStore;

  constructor(home: string) {
    this.store = new ProviderCredentialStore({ home });
  }

  async offer(discover: () => Promise<GGModelsView["models"]>) {
    try {
      const credential = await this.capture();
      if (!credential) return { choices: [] };
      const choices = (await discover())
        .filter((model) => this.supports(model))
        .slice(0, 128)
        .map(
          (model): NativeChatProfiles.Saved => ({
            id: this.binding(credential.scope, model.id),
            providerId: NativeGatewayApiKey.providerId,
            connection: NativeGatewayApiKey.label,
            modelId: model.id,
            model: NativeChatProfiles.displayLabel(model.label, model.id),
            contextWindow: NativeChatProfiles.gatewayContextWindow(model),
          })
        );
      if (!(await credential.isCurrent()))
        return { choices: [], issue: "unavailable" as const };
      return choices.length
        ? { choices }
        : { choices, issue: "noCompatibleModels" as const };
    } catch {
      return { choices: [], issue: "unavailable" as const };
    }
  }

  async launch(
    profile: NativeChatProfiles.Saved,
    discover: () => Promise<GGModelsView["models"]>,
    network: () => Promise<NativeProviderNetwork>
  ) {
    const credential = await this.capture();
    if (
      !credential ||
      this.binding(credential.scope, profile.modelId) !== profile.id
    )
      throw new Error("native_chat_profile_changed");

    const model = (await discover()).find(
      (model) => model.id === profile.modelId
    );
    if (!model || !this.supports(model))
      throw new Error("native_chat_profile_unavailable");
    const transport = await network();
    if (
      !(await credential.isCurrent()) ||
      (await transport.isCurrent?.()) === false
    )
      throw new Error("native_chat_profile_unavailable");
    return {
      provider: "openai-compatible" as const,
      endpoint: ProviderNetworkPolicy.GG_API_BASE,
      model: model.id,
      maxOutputTokens: NativeChatProfiles.gatewayOutputLimit(model),
      contextWindowTokens: NativeChatProfiles.gatewayContextWindow(model),
      providerNetwork: {
        isCurrent: async () =>
          (await transport.isCurrent?.()) !== false &&
          (await credential.isCurrent()),
        prepare: (url, headers) => {
          if (
            url !== ProviderNetworkPolicy.GG_API_CHAT_URL ||
            headers.has("authorization")
          )
            return null;
          return async (body, signal) => {
            let response: Promise<Response | null> | undefined;
            const admitted = await credential.admit(() => {
              if (signal.aborted) return false;
              const outgoing = new Headers(headers);
              outgoing.set("authorization", credential.bearer);
              outgoing.set("idempotency-key", randomUUID());
              const dispatch = transport.prepare(url, outgoing);
              if (!dispatch) return false;
              response = dispatch(body, signal);
              void response.catch(() => {});
              return true;
            });
            return admitted && response ? await response : null;
          };
        },
      } satisfies NativeProviderNetwork,
    };
  }

  private supports(model: GGModelsView["models"][number]) {
    // The current agent harness runs streamed Chat Completions with tools.
    return (
      NativeChatProfiles.gatewayOutputLimit(model) !== undefined &&
      model.capabilities.streaming === true &&
      model.capabilities.tools === true
    );
  }

  private binding(scope: string, model: string) {
    return createHash("sha256")
      .update(
        JSON.stringify(["desktop-gateway-api-key-model-v1", scope, model])
      )
      .digest("hex");
  }

  private async capture() {
    const slot = NativeGatewayApiKey.credentialId;
    const key = await this.store.read(slot);
    if (key === null) return;
    if (!/^sk-gg-v1-[!-~]+$/.test(key) || key.length > 4096)
      throw new Error("native_provider_credential_unavailable");
    const scope = createHash("sha256")
      .update("desktop-gateway-key-v1:")
      .update(key)
      .digest("hex");
    return {
      scope,
      bearer: `Bearer ${key}`,
      isCurrent: () => this.store.admit(slot, key, () => true),
      admit: (start: () => boolean) => this.store.admit(slot, key, start),
    };
  }
}
