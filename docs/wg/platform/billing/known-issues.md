---
title: Billing — Known Issues
tags:
  - internal
  - wg
  - platform
  - billing
status: living
---

# Billing — Known Issues

> Living document. Every known issue in the billing surface (subscriptions,
> AI credit, Stripe ↔ Metronome sync, webhooks) is tracked here with its
> cause, current behavior, mitigation, and planned fix.
>
> Add new issues at the **bottom**. Don't delete entries when fixed —
> move them to the **Resolved** section with the PR / commit that closed
> them. The history is the audit trail for "why did we do it that way."

| ID          | Area                    | Severity | Status    |
| ----------- | ----------------------- | -------- | --------- |
| KI-BILL-001 | AI credit · auto-reload | Medium   | Mitigated |
| KI-BILL-002 | Subscriptions           | Low      | Accepted  |

---

## KI-BILL-001 — Silent auto-recharge runs at-cost (markup gap)

**Area.** AI credit · Metronome `prepaid_balance_threshold_configuration`.

**Discovered.** 2026-05 during the AI credit v1 implementation.

**Cause.** Metronome's threshold-recharge primitive
(`prepaid_balance_threshold_configuration`) exposes a single
`recharge_to_amount` field. That value is used as both:

1. the amount **charged** to the customer's saved card via Stripe, and
2. the amount **credited** to the Metronome balance.

There is no separate "charge X, credit Y" mode on this primitive. Our
markup envelope (`lib/billing/fees.ts > totalChargeForCredit`,
`ceil((credit + 30) / 0.95)`) needs the two amounts to differ — the user
pays gross, receives net. Because we can't apply that envelope here, every
silent recharge fires at-cost: Stripe takes its 2.9–4.4% + $0.30 + optional
1% FX out of our pocket.

**Current behavior.**

- The **first** auto-reload setup goes through Stripe Checkout
  (`startEnableAutoReloadCheckout`) with the markup applied — that
  charge is safe.
- **Subsequent** silent recharges — fired by Metronome when balance
  crosses the threshold — run at-cost. Per-fire loss:

  | Card                 | Recharge | Loss   |
  | -------------------- | -------- | ------ |
  | US Visa/MC, $25      | $25.00   | $1.03  |
  | US Visa/MC, $100     | $100.00  | $3.20  |
  | US Visa/MC, $500     | $500.00  | $14.80 |
  | Intl card, $100      | $100.00  | $4.20  |
  | Intl card + FX, $100 | $100.00  | $5.20  |

**Mitigation (shipped, v1).** Auto-reload is gated behind an active paid
subscription (`assertAutoReloadAllowed` in
`editor/app/(site)/organizations/[organization_name]/settings/billing/_actions.ts`).

- Free orgs cannot enable auto-reload at all. The UI hides the toggle
  behind a "Pro plan required" badge with an Upgrade CTA.
- Paid orgs can enable it; the silent-recharge loss is then bounded and
  recovered from the base-plan margin.
- Manual top-up is unaffected — it always goes through Checkout, always
  pays the markup. Free users have full access to manual top-up.

This converts an unbounded, per-recharge loss (scales with usage on the
free tier) into a fixed, predictable cost on the subscriber population
that already covers it.

**Planned fix.** Drop reliance on Metronome's threshold-config charge
behavior; drive recharges from the
`alerts.low_remaining_commit_balance_reached` webhook with our own
`add_commits` call using `access_schedule.amount ≠ invoice_schedule.amount`
(Metronome's commit API supports this split). Metronome still does balance
tracking, alert evaluation, and Stripe charge execution — we just route the
trigger and apply the markup ourselves.

- Estimated effort: ~130 LOC.
- Once shipped, the subscription gate on auto-reload can be lifted.
- Tracking issue: TODO — file before unblocking free-tier auto-reload.

**Why we didn't fix it before shipping.** The fix touches the alert
webhook handler, requires a new outbound `add_commits` call path, and
needs careful ordering against Metronome's own balance bookkeeping
(don't double-credit on race). Not worth blocking v1 for a loss surface
we can cap at the product layer in five lines.

**Files.**

- `editor/lib/billing/fees.ts` — markup envelope (correct path).
- `editor/lib/billing/metronome.ts > setAutoReload` — Metronome
  threshold-config call (the at-cost path).
- `editor/app/(site)/organizations/[organization_name]/settings/billing/_actions.ts > assertAutoReloadAllowed`
  — subscription gate.
- `docs/wg/platform/billing/ai-credits.md` "Auto-reload envelope" —
  references this entry.

---

## KI-BILL-002 — Concurrent subscribe Checkouts can produce orphan Stripe sub

**Area.** Subscriptions · Stripe Checkout race.

**Discovered.** During the subscription system v1 design (TC-BILLING-SUB-059).

**Cause.** `startSubscribeCheckout` checks for an existing active sub
locally before opening Checkout, but two concurrent calls (e.g. the user
opens Checkout in two browser tabs and pays in both) can both pass the
check and produce two live Stripe subscriptions.

**Current behavior.** The second `customer.subscription.created` webhook
is rejected at the DB layer by `subscription_one_active_per_org_idx`.
Locally the org has exactly one active subscription. Stripe, however,
holds two — one of them is unbacked by any local row and will keep
billing the customer.

**Mitigation (shipped, v1).** None at the application layer. Closure
documented inline at `_actions.ts > startSubscribeCheckout` referencing
GRIDA-60.

**Planned fix.** Track open Checkout sessions in
`grida_billing.checkout_session` (or similar); reject a new
`startSubscribeCheckout` call when an open session for the same org is
younger than the Checkout session TTL.

**Why accepted for v1.** Risk is to Grida (we refund manually on the
duplicate Stripe sub), not the customer. Volume in v1 is bounded by
manual onboarding; not worth the schema work yet.

---

## Resolved

_(none yet)_

---

## Adding a new entry

Use the next sequential `KI-BILL-NNN` id. Required sections:

- **Area** — which subsystem.
- **Discovered** — date and context.
- **Cause** — the root mechanism, not just the symptom.
- **Current behavior** — what users / Grida actually see today.
- **Mitigation** — what's shipped to keep the loss / risk bounded.
- **Planned fix** — concrete next step, with effort estimate.
- **Why we didn't fix it before shipping** — required if status is
  "Mitigated" or "Accepted."
- **Files** — pointers into the codebase. Helps the future fix-PR
  scope itself.
