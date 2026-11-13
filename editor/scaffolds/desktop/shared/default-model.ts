// GRIDA-GG: desktop — default-model selection (included gg tier when a session is live)
/**
 * Which model the welcome composer starts on — the pure decision kernel
 * behind {@link useModelPickerState}.
 *
 * The renderer's hooks are thin wires; the load-bearing choice lives here
 * so it can be unit-tested in Node without a React render (see
 * `default-model.test.ts`). Three decisions:
 *
 *  - {@link resolveDefaultModelSelection} — the initial provider/model pair.
 *  - {@link reconcileChatGptSubscriptionDefault} — the live ready/sign-out
 *    transition for an untouched selection.
 *  - {@link shouldUpgradeToIncluded} — whether an async Grida Gateway
 *    "session active" resolution may replace that initial default (it
 *    arrives after mount, so it can't be baked into the first value).
 *
 * Precedence, highest first: an explicit user pick / ready ChatGPT
 * Subscription / a live Grida session / the generic fallback. Every resolved
 * product default carries provider identity; a user pick always wins.
 */
import { AGENT_DEFAULT_TIER, TIER_MODEL_IDS } from "@grida/ai/catalogue";
import {
  CHATGPT_PROVIDER_ID,
  GG_PROVIDER_ID,
  type ChatGptSubscriptionModelId,
} from "@grida/agent";

export type DefaultModelSelection = Readonly<{
  model_id: string;
  provider_id?: string;
}>;

/**
 * The keyless fallback default — a catalog model id compatible with the
 * first-priority ChatGPT provider and the remaining native-provider cascade.
 * ACP models are a separate external-agent class and are not part of this
 * model picker.
 */
export const DEFAULT_MODEL_ID: string = TIER_MODEL_IDS[AGENT_DEFAULT_TIER];

/**
 * The included hosted tier a live Grida Gateway session upgrades the
 * keyless default to — a catalog model id served by `gg` (the default tier).
 * A catalog id so it remains compatible with native model providers.
 */
export const GG_INCLUDED_MODEL_ID: string = TIER_MODEL_IDS[AGENT_DEFAULT_TIER];

/**
 * Desktop-only default for an untouched, ready subscription-backed chat.
 * The compile-time check keeps the catalogue's default tier on the closed,
 * observed ChatGPT subscription allowlist even when `max` moves ahead of it.
 */
export const CHATGPT_READY_DEFAULT_MODEL_ID = TIER_MODEL_IDS[
  AGENT_DEFAULT_TIER
] satisfies ChatGptSubscriptionModelId;

/**
 * The initial default. A ready subscription chooses ChatGPT/Sol, a live
 * Grida session chooses Grida/Sol, and the unresolved fallback stays
 * provider-less until availability resolves.
 */
export function resolveDefaultModelSelection(opts: {
  chatGptReady: boolean;
  ggActive: boolean;
}): DefaultModelSelection {
  if (opts.chatGptReady) {
    return {
      model_id: CHATGPT_READY_DEFAULT_MODEL_ID,
      provider_id: CHATGPT_PROVIDER_ID,
    };
  }
  if (opts.ggActive) {
    return {
      model_id: GG_INCLUDED_MODEL_ID,
      provider_id: GG_PROVIDER_ID,
    };
  }
  return { model_id: DEFAULT_MODEL_ID };
}

/**
 * Reconcile the untouched subscription default in both directions. The
 * result is transient UI state: it is not a saved preference.
 */
export function reconcileChatGptSubscriptionDefault(opts: {
  current: DefaultModelSelection;
  chatGptReady: boolean;
  ggActive: boolean;
  userPicked: boolean;
}): DefaultModelSelection {
  if (opts.userPicked) return opts.current;
  const isGenericDefault =
    opts.current.model_id === DEFAULT_MODEL_ID &&
    opts.current.provider_id === undefined;
  const isGridaDefault =
    opts.current.model_id === GG_INCLUDED_MODEL_ID &&
    opts.current.provider_id === GG_PROVIDER_ID;
  const isChatGptDefault =
    opts.current.model_id === CHATGPT_READY_DEFAULT_MODEL_ID &&
    opts.current.provider_id === CHATGPT_PROVIDER_ID;

  if (opts.chatGptReady && (isGenericDefault || isGridaDefault)) {
    return {
      model_id: CHATGPT_READY_DEFAULT_MODEL_ID,
      provider_id: CHATGPT_PROVIDER_ID,
    };
  }
  if (!opts.chatGptReady && isChatGptDefault) {
    return opts.ggActive
      ? {
          model_id: GG_INCLUDED_MODEL_ID,
          provider_id: GG_PROVIDER_ID,
        }
      : { model_id: DEFAULT_MODEL_ID };
  }
  return opts.current;
}

/**
 * Whether an async "Grida Gateway session is active" resolution should
 * replace the current selection with {@link GG_INCLUDED_MODEL_ID}. True
 * only for the *untouched fallback default* — it never overrides an
 * explicit user pick.
 */
export function shouldUpgradeToIncluded(opts: {
  current: DefaultModelSelection;
  userPicked: boolean;
}): boolean {
  if (opts.userPicked) return false;
  return (
    opts.current.model_id === DEFAULT_MODEL_ID &&
    opts.current.provider_id === undefined
  );
}
