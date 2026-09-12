---
title: Billing — Known Issues
description: Known subscription and AI-credit billing limitations, mitigations and remaining reconciliation work.
keywords: [billing, AI credits, reconciliation, metronome, Tripo]
format: md
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

| ID          | Area                                | Severity | Status    |
| ----------- | ----------------------------------- | -------- | --------- |
| KI-BILL-001 | AI credit · auto-reload             | Medium   | Mitigated |
| KI-BILL-002 | Subscriptions                       | Low      | Accepted  |
| KI-BILL-003 | Subscriptions · plan grant          | Medium   | Resolved  |
| KI-BILL-004 | AI credit · image receipts          | Medium   | Mitigated |
| KI-BILL-005 | AI credit · Tripo terminal receipts | Medium   | Mitigated |

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

**Mitigation (shipped, v1).** Self-service auto-reload is gated behind an
active standard subscription—Pro or a historical Team subscription—by
`assertAutoReloadAllowed` in
`editor/app/(site)/organizations/[organization_name]/settings/billing/_actions.ts`.

- Free orgs cannot enable auto-reload at all. The UI hides the toggle
  behind a "Pro plan required" badge with an Upgrade CTA.
- Pro orgs can enable it. Existing Team subscribers keep access while they
  transition to Pro monthly. The silent-recharge loss is bounded and recovered
  from the base-plan margin.
- Custom configuration follows the organization's agreement rather than this
  self-service path.
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

## KI-BILL-004 — Image-cost fallback does not reconcile token usage

**Area.** Hosted image generation · prepaid AI credit.

**Discovered.** September 2026, while adding the six quality levels of GPT
Image 2.5. This is a metering finding, not a new pricing policy.

**Cause.** Token-priced images have variable input, cache, quality, and size
costs. A single average invocation estimate cannot represent every request;
aggregate input/output token counts also cannot distinguish differently priced
text and image tokens.

**Current behavior.** When Gateway supplies a valid response cost, hosted image
usage is metered from that USD receipt, including a legitimate zero. Otherwise,
the existing catalog estimate is used. For GPT Image 2.5 that fallback is
$0.055 per requested image, regardless of quality and dimensions, and can
overcharge or undercharge relative to the provider's actual charge. It is not
an exact per-image price.

**Mitigation.** [PR #1031](https://github.com/gridaco/grida/pull/1031) prefers
the upstream receipt over the estimate, does not round away fractional mills,
and never treats malformed receipts as free usage. The receipt is trusted only
from the provider response, never from a caller-supplied field. BYOK requests
are paid directly to the provider and are unaffected.

**Remaining work.** Verify receipt coverage for each hosted image route and
add provider-specific reconciliation where a receipt is absent. A missing
receipt must remain distinguishable from a genuine zero charge. Coverage
cannot be inferred from a model-list entry or from mocked transport tests.

**Why the fallback remains.** This preserves the existing hosted-image billing
contract when no exact meter is returned; it does not guess a modality split
or discard an already-generated result. The [user-facing pricing notes](../../../models/index.md)
disclose the approximation. Provider receipt coverage has not been verified
with paid live generations in this change.

**Implementation references.** [Image billing middleware](https://github.com/gridaco/grida/blob/main/editor/lib/ai/server.ts)
and [fallback pricing](https://github.com/gridaco/grida/blob/main/editor/lib/ai/image-cost.ts).

---

## KI-BILL-005 — Tripo jobs without an observed terminal receipt need reconciliation

**Area.** Hosted 3D generation and rigging · prepaid AI credit.

**Discovered.** September 2026 while adding funded Tripo operations.

**Cause.** Provider execution can outlive a synchronous gateway invocation.
After accepting a job, the provider may finish after the gateway deadline or
process termination. A successful response may also omit usage. Neither an
accepted job identifier nor a catalog estimate proves the eventual charge.

**Current behavior.** An observed successful task with valid usage is billed at
the catalog USD-per-provider-credit rate. This includes later model download,
validation and cancellation failures. A job without observed terminal usage
fails without a fabricated charge; available organization, model, transaction
and task identifiers are recorded for reconciliation. A hard process kill can
prevent that diagnostic record. No durable background reconciliation is added
by this synchronous integration.

**Mitigation.** The service retains validated terminal receipts independently
of asset delivery, gates before provider work, rate-limits submissions and never
automatically submits a replacement paid task. Unknown usage cannot produce a
successful free result. Existing transaction-ingest failures retain the shared
AI seam's logging behavior.

**Planned fix.** Persist accepted provider-job ownership before polling, observe
terminal states independently of the requesting client, and reconcile usage
with a stable idempotent transaction identifier. This is a separate durable-job
and billing integration, including retry and restart proofs.

**Why not resolved in this change.** The funded feature follows GG's current
synchronous execution lifecycle. This mitigation covers known completed charges
without inventing a second billing ledger or changing retry semantics. Until a
durable observer exists, unobserved provider charges require operator review.

**Files.** [Tripo billing seam](https://github.com/gridaco/grida/blob/main/editor/lib/ai/gg-three-d.ts)
and [shared transaction owner](https://github.com/gridaco/grida/blob/main/editor/lib/ai/server.ts).

---

## Resolved

### KI-BILL-003 — Unsupported plan-included credit promise

**Area.** Subscriptions · plan-included AI credit.

**Cause.** Public pricing and billing copy promised recurring Free, Pro, and
Team AI-credit grants even though no grant mechanism existed. A paid
subscription therefore received the same zero balance as Free until the
organization purchased credit.

**Resolution.** The current [billing-plan contract](./plans.md) makes AI credit
separate from the plan price and promises no recurring grant. Customer-facing
pricing and billing copy were rewritten to match the implemented system:
manual credit purchases are available, and automatic reload is the paid-plan
convenience.

This issue is resolved by removing the unsupported promise, not by silently
adding a financial entitlement. A future recurring grant requires a new
commercial contract and an implemented grant lifecycle before it is advertised.

**Closed by.** [PR #1010](https://github.com/gridaco/grida/pull/1010).

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
