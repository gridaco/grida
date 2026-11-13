// GRIDA-GG: provider — the `gg` hosted provider id + metadata (docs/wg/platform/hosted-ai.md)
// GRIDA-SEC-008 — reserve the native provider id in the shared namespace.
/**
 * BYOK provider identity + neutral metadata.
 *
 * Client-safe. No provider SDK imports; this is just the public identity
 * contract consumers can compile against and render from.
 */

import { CHATGPT_PROVIDER_ID } from "./chatgpt";

export {
  CHATGPT_PROVIDER_ID,
  CHATGPT_PROVIDER_METADATA,
  CHATGPT_SUBSCRIPTION_MODEL_IDS,
  CHATGPT_SUBSCRIPTION_MODEL_METADATA,
  isChatGptProviderId,
  isChatGptSubscriptionModelId,
} from "./chatgpt";

// Shared model-provider identity lives with the AI provider implementations.
import { type ByokProviderId, GG_PROVIDER_ID } from "@grida/ai/providers";
export {
  BYOK_PROVIDER_METADATA,
  BYOK_PROVIDER_IDS,
  byokProvidersFor,
  isByokProviderId,
  GG_PROVIDER_ID,
  GG_PROVIDER_METADATA,
  isGgProviderId,
  type ByokProviderId,
  type ByokProviderMetadata,
  type ByokModality,
} from "@grida/ai/providers";

/**
 * A provider id anywhere on the wire (run options, session rows, secrets):
 * a native ChatGPT subscription id, BYOK id, the grida hosted id, or a
 * configured endpoint id (issue #806). `string & {}` keeps literal
 * completion for the known ids while admitting endpoint ids, which are
 * user-chosen slugs validated at the boundary.
 */
export type ProviderId =
  | ByokProviderId
  | typeof GG_PROVIDER_ID
  | typeof CHATGPT_PROVIDER_ID
  | (string & {});
