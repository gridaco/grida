// GRIDA-SEC-004 / GRIDA-SEC-008 — auxiliary inference inherits its foreground authority.
import {
  GG_PROVIDER_ID,
  type EndpointProviderConfig,
  type GGModelsView,
} from "@grida/ai-host";
import {
  bundledModelCatalogue,
  catalog,
  ChatModels,
  TIER_MODEL_IDS,
} from "@grida/ai/catalogue";
import { OPENAI_PROJECT_PROVIDER_ID } from "@grida/ai/providers";
import type { ModelCatalogueSnapshot } from "@grida/ai/model-catalogue";
import { NativeChatProfiles } from "./native-chat-profiles";
import { NativeProviderSelection } from "./native-provider-selection";
import type { NativeProviderRouteLaunch } from "./native-provider-routes";

export namespace NativePredictionRoute {
  type Inventory = {
    snapshot?: ModelCatalogueSnapshot;
    subscription?: (
      model: string,
      signal: AbortSignal
    ) => Promise<NativeProviderRouteLaunch>;
    endpoints: () => Promise<readonly EndpointProviderConfig[]>;
    gateway: () => Promise<GGModelsView["models"]>;
  };

  /** The supervisor supplies the already captured foreground connection. Only
   * its owner may attest that an economy model is available on that connection. */
  export async function resolve(
    source: NativeProviderRouteLaunch,
    signal: AbortSignal,
    inventory: Inventory
  ): Promise<NativeProviderRouteLaunch | undefined> {
    signal.throwIfAborted();
    const nano = TIER_MODEL_IDS.nano;
    if (!source.providerNetwork) return;
    if (source.subscriptionScope) {
      // A separate capture binds the exact Responses wire model and sign-in lineage.
      const target = await inventory.subscription?.(nano, signal);
      return target?.model === nano &&
        target.subscriptionScope === source.subscriptionScope &&
        target.endpoint === source.endpoint &&
        target.provider === source.provider
        ? target
        : undefined;
    }
    if (source.provider !== "openai-compatible") return;
    if (source.configuredEndpointId) {
      if (!NativeProviderSelection.isLoopbackEndpoint(source.endpoint)) return;
      const endpoints = await inventory.endpoints();
      return endpoints.some(
        (endpoint) =>
          endpoint.id === source.configuredEndpointId &&
          endpoint.base_url === source.endpoint &&
          endpoint.models.some(({ id }) => id === source.model) &&
          (!source.llamaCppInputCount ||
            endpoint.input_counting === "llama.cpp")
      )
        ? source
        : undefined;
    }
    const foreground = catalog.text
      .listed_models()
      .find(({ id }) => id === source.model);
    if (
      !foreground ||
      !withinRates(foreground.cost, catalog.text.byTier.nano.cost)
    )
      return;
    if (source.gatewayScope) {
      const models = await inventory.gateway();
      if (
        !models.some(
          (model) =>
            model.id === source.model &&
            NativeChatProfiles.gatewayOutputLimit(model) !== undefined
        )
      )
        return;
      const maximum = NativeChatProfiles.gatewayChatOutputLimit(
        models.find(({ id }) => id === nano)
      );
      if (maximum === undefined) return;
      return {
        ...source,
        model: nano,
        maxOutputTokens: maximum,
        reasoning:
          NativeChatProfiles.reasons(GG_PROVIDER_ID, nano) || undefined,
      };
    }
    const provider = NativeProviderSelection.builtInProviderId(source.endpoint);
    if (
      !provider ||
      !NativeProviderSelection.isBuiltInByok(provider) ||
      provider === OPENAI_PROJECT_PROVIDER_ID ||
      !source.credentialHome ||
      source.configuredEndpointKey
    )
      return;
    const binding = ChatModels.resolve(
      inventory.snapshot ?? bundledModelCatalogue(),
      { provider },
      nano
    );
    if (!binding) return;
    return {
      ...source,
      model: nano,
      wireModel: binding.wireModel,
      imageInput: binding.imageInput,
      imageGeneration: undefined,
      maxOutputTokens: binding.maxOutputTokens,
      reasoning: binding.reasoning || undefined,
    };
  }

  /** A price ceiling for every input/output bucket, on either side of both
   * long-context thresholds. A missing cache rate uses ordinary input pricing. */
  export function withinRates(
    source: catalog.text.ModelCostPerMillion,
    target: catalog.text.ModelCostPerMillion
  ): boolean {
    const thresholds = [
      0,
      (source.longContext?.inputTokensAbove ?? 0) + 1,
      (target.longContext?.inputTokensAbove ?? 0) + 1,
    ];
    return thresholds.every((tokens) => {
      const from =
        source.longContext && tokens > source.longContext.inputTokensAbove
          ? source.longContext
          : undefined;
      const to =
        target.longContext && tokens > target.longContext.inputTokensAbove
          ? target.longContext
          : undefined;
      return (
        target.output * (to?.outputMultiplier ?? 1) <=
          source.output * (from?.outputMultiplier ?? 1) &&
        (["input", "cacheRead", "cacheWrite"] as const).every(
          (bucket) =>
            (target[bucket] ?? target.input) * (to?.inputMultiplier ?? 1) <=
            (source[bucket] ?? source.input) * (from?.inputMultiplier ?? 1)
        )
      );
    });
  }
}
