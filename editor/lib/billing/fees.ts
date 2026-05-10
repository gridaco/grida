// Pass-through markup on AI-credit top-ups.
//
// Why:
//   The AI-credits design (docs/wg/platform/billing/ai-credits.md) commits to
//   "AI is sold at cost." For the credit balance to actually be at-cost
//   we need to pass payment-processing costs through to the customer —
//   otherwise we lose money on every top-up. Grida is not a payment
//   processor.
//
// Why a flat over-engineered rate (and not "Stripe's actual fee"):
//   Stripe's effective fee depends on the card the customer ends up
//   using — which we don't know until after the charge:
//     • US card:                  2.9% + $0.30
//     • International card:       3.9% + $0.30
//     • AmEx (US):                3.5% + $0.30
//     • International AmEx:       4.4% + $0.30
//     • + 1.0% currency conversion if the card's currency differs
//   So any "exact" formula keyed on US-card rates loses money on the
//   non-US cases. We instead pick a single safe envelope.
//
// The chosen formula (verified by `editor/scripts/billing/cli.ts markup-sim`):
//
//     total_cents = ceil((credit_cents + 30) / 0.95)
//
//   In words: gross up by 5% with a $0.30 buffer.
//
//   This is the lowest-friction formula that NEVER loses money across
//   all six card-type combinations, for credit amounts in [$10, $500]
//   (the product-enforced range). Worst case (intl card + currency
//   conversion) lands within $0.01–$0.53 of break-even; best case
//   (US card) overcharges by 8.5% at $10 and ~5.3% at $500.
//
//   Markup-simulator output is the audit trail. Re-run whenever
//   Stripe's rates change OR the product range changes.
//
// Scope:
//   Applied at user-initiated Checkout (manual top-up, first
//   auto-reload setup). NOT applied to Metronome's silent
//   auto-recharges via `prepaid_balance_threshold_configuration` —
//   that primitive doesn't separate charged from credit amounts, so
//   silent recharges run at-cost (we eat ~3% on those). Acceptable v1
//   cost; revisit if margin pressure builds.

const MARKUP_PCT = 0.05;
const MARKUP_FIXED_CENTS = 30;

/**
 * Total to charge the customer to net `creditCents` after Stripe's
 * fee, across every supported card type. Always rounds UP to the
 * nearest cent so we never undercharge.
 *
 * Returns 0 for non-positive inputs.
 */
export function totalChargeForCredit(creditCents: number): number {
  if (!Number.isFinite(creditCents) || creditCents <= 0) return 0;
  return Math.ceil((creditCents + MARKUP_FIXED_CENTS) / (1 - MARKUP_PCT));
}

/**
 * The processing-fee component of the total charge.
 * `total = credit + processingFee(credit)`.
 */
export function processingFeeCents(creditCents: number): number {
  return totalChargeForCredit(creditCents) - creditCents;
}

// ---------------------------------------------------------------------------
// Product-enforced amount limits — quoted by the validators in both the
// service layer (`lib/billing/metronome.ts`) and the user-facing actions
// (`app/(site)/.../billing/_actions.ts`). Anything outside these ranges
// breaks the safety guarantee of the markup formula above.
// ---------------------------------------------------------------------------

/** Minimum top-up purchase. Below this, the fixed $0.30 fee dominates. */
export const TOPUP_MIN_CENTS = 1000; // $10
/** Maximum single top-up. Above this we're underwriting more risk than the markup justifies. */
export const TOPUP_MAX_CENTS = 50_000; // $500

/** Minimum auto-reload threshold. Whole dollars; $5 is enough headroom that
 *  the silent recharge has time to land before the gate floor (25¢) trips. */
export const AUTO_RELOAD_THRESHOLD_MIN_CENTS = 500; // $5
/** Minimum auto-reload recharge-to-target. Whole dollars. Larger than topup
 *  min so silent recharges have meaningful runway between fires. */
export const AUTO_RELOAD_RECHARGE_MIN_CENTS = 2500; // $25
/** Maximum auto-reload recharge-to-target. Same ceiling as a manual top-up. */
export const AUTO_RELOAD_RECHARGE_MAX_CENTS = 50_000; // $500

/**
 * Hard gate floor: AI is blocked when the org's balance falls below this.
 * Single source of truth for the gate's floor; the DB optimistic-debit RPC
 * (`fn_billing_debit_balance_cache`) takes the same value as a default
 * argument — keep them in sync if changed.
 */
export const AI_GATE_FLOOR_CENTS = 25;

/** Display helper: cents → "$X.XX". */
export function fmtUsd(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}
