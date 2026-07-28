/**
 * Pure provider/model options for the Desktop text-model picker.
 *
 * A model id does not identify who serves it. In particular, the same
 * `openai/*` id may run through ChatGPT, BYOK, Grida, or a configured
 * endpoint. Every provider-owned picker row therefore carries the exact
 * `{ provider_id, model_id }` tuple it selects.
 */

import {
  BYOK_PROVIDER_METADATA,
  CHATGPT_PROVIDER_ID,
  CHATGPT_SUBSCRIPTION_MODEL_IDS,
  CHATGPT_SUBSCRIPTION_MODEL_METADATA,
  GG_PROVIDER_ID,
  GG_PROVIDER_METADATA,
  isChatGptSubscriptionModelId,
  type ByokProviderId,
  type EndpointProviderConfig,
} from "@grida/agent";
import _models from "@grida/ai-models";

export type ModelPickerSelection = Readonly<{
  model_id: string;
  provider_id?: string;
}>;

export type ModelPickerOption = Readonly<{
  selection: ModelPickerSelection;
  label: string;
  deprecated?: boolean;
}>;

export type ModelPickerGroup = Readonly<{
  id: string;
  label: string;
  options: readonly ModelPickerOption[];
}>;

const textCatalog = _models.text.catalog;
const modelOptions = Object.values(textCatalog);

export namespace model_picker_options {
  /** The exact closed ChatGPT projection, never every `openai/*` model. */
  export function chatGpt(): ModelPickerGroup {
    return {
      id: CHATGPT_PROVIDER_ID,
      label: "ChatGPT Subscription",
      options: CHATGPT_SUBSCRIPTION_MODEL_IDS.map((modelId) => {
        const catalogSpec = textCatalog[modelId as keyof typeof textCatalog];
        return {
          selection: {
            provider_id: CHATGPT_PROVIDER_ID,
            model_id: modelId,
          },
          label: CHATGPT_SUBSCRIPTION_MODEL_METADATA[modelId].label,
          deprecated: catalogSpec?.deprecated,
        };
      }),
    };
  }

  /** Every hosted text model spends Grida credits through the `gg` provider. */
  export function grida(): ModelPickerGroup {
    return catalogProviderGroup(GG_PROVIDER_ID, GG_PROVIDER_METADATA.label);
  }

  /**
   * Configured text BYOK providers. The closed provider metadata owns order;
   * secret presence owns visibility. Model ids repeat intentionally because
   * each row selects a different billing/privacy boundary.
   */
  export function byok(
    configuredProviderIds: readonly ByokProviderId[]
  ): ModelPickerGroup[] {
    const configured = new Set(configuredProviderIds);
    return BYOK_PROVIDER_METADATA.filter(
      (provider) =>
        configured.has(provider.id) &&
        (provider.modalities as readonly string[]).includes("text")
    ).map((provider) => catalogProviderGroup(provider.id, provider.label));
  }

  export function endpoints(
    endpoints: readonly EndpointProviderConfig[]
  ): ModelPickerGroup[] {
    return [...endpoints]
      .sort((a, b) => (a.id === "ollama" ? -1 : b.id === "ollama" ? 1 : 0))
      .map((endpoint) => ({
        id: endpoint.id,
        label: endpoint.label ?? endpoint.id,
        options: endpoint.models.map((model) => ({
          selection: {
            provider_id: endpoint.id,
            model_id: model.id,
          },
          label: model.label ?? model.id,
        })),
      }))
      .filter((group) => group.options.length > 0);
  }

  export function groups(opts: {
    chatGptReady: boolean;
    configuredByokProviderIds: readonly ByokProviderId[];
    endpoints: readonly EndpointProviderConfig[];
  }): ModelPickerGroup[] {
    return [
      ...(opts.chatGptReady ? [chatGpt()] : []),
      grida(),
      ...byok(opts.configuredByokProviderIds),
      ...endpoints(opts.endpoints),
    ];
  }

  export function label(
    selection: ModelPickerSelection,
    endpoints: readonly EndpointProviderConfig[]
  ): string {
    if (isChatGptSubscriptionModelId(selection.model_id)) {
      const metadata = CHATGPT_SUBSCRIPTION_MODEL_METADATA[selection.model_id];
      if (
        selection.provider_id === CHATGPT_PROVIDER_ID ||
        !textCatalog[selection.model_id as keyof typeof textCatalog]
      ) {
        return metadata.label;
      }
    }
    const catalogSpec =
      textCatalog[selection.model_id as keyof typeof textCatalog];
    if (catalogSpec) return _models.text.displayLabel(catalogSpec);
    for (const endpoint of endpoints) {
      const model = endpoint.models.find(
        (candidate) => candidate.id === selection.model_id
      );
      if (model) return model.label ?? model.id;
    }
    return selection.model_id;
  }

  export function providerLabel(
    providerId: string | undefined,
    endpoints: readonly EndpointProviderConfig[]
  ): string | null {
    if (!providerId) return null;
    if (providerId === CHATGPT_PROVIDER_ID) return "ChatGPT Subscription";
    if (providerId === GG_PROVIDER_ID) return GG_PROVIDER_METADATA.label;
    const byok = BYOK_PROVIDER_METADATA.find(
      (provider) => provider.id === providerId
    );
    if (byok) return byok.label;
    return (
      endpoints.find((endpoint) => endpoint.id === providerId)?.label ??
      providerId
    );
  }

  export function usesChatGpt(selection: ModelPickerSelection): boolean {
    return (
      isChatGptSubscriptionModelId(selection.model_id) &&
      selection.provider_id === CHATGPT_PROVIDER_ID
    );
  }

  export function selected(
    current: ModelPickerSelection,
    candidate: ModelPickerSelection
  ): boolean {
    return (
      current.model_id === candidate.model_id &&
      current.provider_id === candidate.provider_id
    );
  }
}

function catalogProviderGroup(
  providerId: string,
  label: string
): ModelPickerGroup {
  return {
    id: providerId,
    label,
    options: modelOptions.map((model) => ({
      selection: {
        provider_id: providerId,
        model_id: model.id,
      },
      label: _models.text.displayLabel(model),
      deprecated: model.deprecated,
    })),
  };
}
