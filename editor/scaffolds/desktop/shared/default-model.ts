// GRIDA-GG: desktop — default-model selection (included gg tier when a session is live)
/**
 * Which model a fresh desktop chat lands on — the pure decision kernel
 * behind {@link useModelPickerState}.
 *
 * The renderer's hooks are thin wires; the load-bearing choice lives here
 * so it can be unit-tested in Node without a React render (see
 * `default-model.test.ts`). Four decisions:
 *
 *  - {@link resolveDefaultModelSelection} — the initial provider/model pair.
 *  - {@link resolveNewChatTransition} — reset a past chat's transient picker
 *    state when the user opens a genuinely new chat.
 *  - {@link reconcileChatGptSubscriptionDefault} — the live ready/sign-out
 *    transition for an untouched new chat.
 *  - {@link shouldUpgradeToIncluded} — whether an async Grida Gateway
 *    "session active" resolution may replace that initial default (it
 *    arrives after mount, so it can't be baked into the first value).
 *
 * Precedence, highest first: an explicit caller seed / a stored session /
 * ready ChatGPT Subscription / a live Grida session / the generic fallback.
 * Every resolved product default carries provider identity; an explicit or
 * stored provider/model pair always wins.
 */
import { TIER_MODEL_IDS } from "@grida/ai-models";
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
export const DEFAULT_MODEL_ID: string = TIER_MODEL_IDS.pro;

/**
 * The included hosted tier a live Grida Gateway session upgrades the
 * keyless default to — a catalog model id served by `gg` (the "pro" tier).
 * A catalog id so it remains compatible with native model providers.
 */
export const GG_INCLUDED_MODEL_ID: string = TIER_MODEL_IDS.pro;

/**
 * Desktop-only default for an untouched, ready subscription-backed chat.
 * The compile-time check keeps the catalogue's `pro` tier on the closed,
 * observed ChatGPT subscription allowlist even when `max` moves ahead of it.
 */
export const CHATGPT_READY_DEFAULT_MODEL_ID =
  TIER_MODEL_IDS.pro satisfies ChatGptSubscriptionModelId;

/**
 * The initial default for a new chat. An explicit caller-seeded `initial`
 * (a known id — e.g. the welcome handoff carrying the home composer's pick)
 * always wins. Otherwise a ready subscription chooses ChatGPT/Sol, a live
 * Grida session chooses Grida/Sol, and the unresolved fallback stays
 * provider-less until availability resolves.
 */
export function resolveDefaultModelSelection(opts: {
  initial?: string;
  initialProviderId?: string;
  chatGptReady: boolean;
  ggActive: boolean;
  isKnownId: (id: string | undefined | null) => boolean;
}): DefaultModelSelection {
  // A caller-provided `initial` is explicit intent: honor it when known,
  // and NEVER substitute a provider-owned default for it. An id that isn't
  // known yet may be a late-loading endpoint model (issue #806) — falling
  // back to the plain default is safe; silently swapping in ChatGPT or the
  // included model would override the caller's choice.
  if (opts.initial != null && opts.initial !== "") {
    return opts.isKnownId(opts.initial)
      ? {
          model_id: opts.initial,
          ...(opts.initialProviderId
            ? { provider_id: opts.initialProviderId }
            : {}),
        }
      : { model_id: DEFAULT_MODEL_ID };
  }
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
 * A model picker stays mounted while the user moves between chats. The chat
 * binding epoch changes only for a real rebind, including an explicit New
 * Chat while the current id is already `null`. The initial undefined epoch
 * may carry an explicit welcome handoff and must remain untouched.
 */
export function resolveNewChatTransition(opts: {
  previousBindingEpoch: number | undefined;
  currentBindingEpoch: number;
  currentSessionId: string | null;
  chatGptReady: boolean;
  ggActive: boolean;
}): DefaultModelSelection | null {
  if (
    opts.previousBindingEpoch === undefined ||
    opts.previousBindingEpoch === opts.currentBindingEpoch ||
    opts.currentSessionId !== null
  ) {
    return null;
  }
  return resolveDefaultModelSelection({
    chatGptReady: opts.chatGptReady,
    ggActive: opts.ggActive,
    isKnownId: () => false,
  });
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
  hasInitial: boolean;
  storedSeeded: boolean;
}): DefaultModelSelection {
  if (opts.userPicked || opts.hasInitial || opts.storedSeeded) {
    return opts.current;
  }
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
 * explicit user pick, a caller-provided `initial`, or a stored-session seed.
 */
export function shouldUpgradeToIncluded(opts: {
  current: DefaultModelSelection;
  userPicked: boolean;
  /**
   * Whether the caller provided an `initial` at all (explicit intent).
   * Deliberately "was one provided", NOT "is it *known*": knownness depends
   * on the async endpoint registry (issue #806) and would go stale in this
   * mount-time effect, whereas whether an `initial` prop was passed is a
   * stable fact. A provided-but-not-yet-known `initial` must still block the
   * upgrade so an explicit pick is never overwritten.
   */
  hasInitial: boolean;
  storedSeeded: boolean;
}): boolean {
  if (opts.userPicked) return false;
  if (opts.hasInitial) return false;
  if (opts.storedSeeded) return false;
  return (
    opts.current.model_id === DEFAULT_MODEL_ID &&
    opts.current.provider_id === undefined
  );
}
