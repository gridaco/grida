// GRIDA-GG: desktop — default-model selection (included gg tier when a session is live)
/**
 * Which model a fresh desktop chat lands on — the pure decision kernel
 * behind {@link useModelPickerState}.
 *
 * The renderer's hooks are thin wires; the load-bearing choice lives here
 * so it can be unit-tested in Node without a React render (see
 * `default-model.test.ts`). Two decisions:
 *
 *  - {@link resolveDefaultModelId} — the *initial* default for a new chat.
 *  - {@link shouldUpgradeToIncluded} — whether an async Grida Gateway
 *    "session active" resolution may replace that initial default (it
 *    arrives after mount, so it can't be baked into the first value).
 *
 * Precedence, highest first: an explicit caller-seeded pick / a stored
 * session model / a live GG session (included, no key) / the Claude-Code
 * default. BYOK is orthogonal — it changes who *serves* a chosen model
 * (BYOK → gg → endpoints), never which model a fresh chat defaults to.
 */
import { TIER_MODEL_IDS } from "@grida/ai-models";

/**
 * The keyless fallback default — Claude Code on Opus 4.8 (1M), the user's
 * own Claude subscription (issue #813): zero key, the largest context.
 * NOTE: assumes the user is logged in to Claude — with no Claude login and
 * no live Grida Gateway session, a first run hits `auth_required`. A live
 * GG session upgrades this to {@link GG_INCLUDED_MODEL_ID} so a signed-in,
 * no-BYOK user's first run just works (issue #942).
 */
export const DEFAULT_MODEL_ID: string = "claude-code/opus-4.8-1m";

/**
 * The included hosted tier a live Grida Gateway session upgrades the
 * keyless default to — a catalog model id served by `gg` (the "pro" tier).
 * A catalog id (not a `claude-code/*` agent-provider id) so it routes
 * through the gateway under the BYOK → gg → endpoints precedence.
 */
export const GG_INCLUDED_MODEL_ID: string = TIER_MODEL_IDS.pro;

/**
 * The initial default for a new chat. An explicit caller-seeded `initial`
 * (a known id — e.g. the welcome handoff carrying the home composer's
 * pick) always wins; otherwise the Claude-Code default. The GG upgrade is
 * NOT applied here because session liveness is only known asynchronously
 * (see {@link shouldUpgradeToIncluded}); `ggActive` is threaded only so a
 * caller that already knows the state can seed the included model directly.
 */
export function resolveDefaultModelId(opts: {
  initial?: string;
  ggActive: boolean;
  isKnownId: (id: string | undefined | null) => boolean;
}): string {
  if (opts.isKnownId(opts.initial)) return opts.initial as string;
  if (opts.ggActive) return GG_INCLUDED_MODEL_ID;
  return DEFAULT_MODEL_ID;
}

/**
 * Whether an async "Grida Gateway session is active" resolution should
 * replace the current selection with {@link GG_INCLUDED_MODEL_ID}. True
 * only for the *untouched fallback default* — it never overrides an
 * explicit user pick, a caller-seeded `initial`, or a stored-session seed.
 */
export function shouldUpgradeToIncluded(opts: {
  current: string;
  userPicked: boolean;
  initialKnown: boolean;
  storedSeeded: boolean;
}): boolean {
  if (opts.userPicked) return false;
  if (opts.initialKnown) return false;
  if (opts.storedSeeded) return false;
  return opts.current === DEFAULT_MODEL_ID;
}
