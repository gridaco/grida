---
title: AI Credits — Master Plan
tags:
  - internal
  - wg
  - platform
  - billing
  - ai
status: implementation
---

| feature id   | status                | description                                                                          | PRs |
| ------------ | --------------------- | ------------------------------------------------------------------------------------ | --- |
| `ai-credits` | implementation (v1.0) | Metered AI usage with top-ups and auto-reload. Metronome = ledger; Stripe = payment. | —   |

# AI Credits — Master Plan

> Companion to [docs/platform/billing.mdx](../../platform/billing.mdx) (the
> user-facing promise). This doc says **how** we implement AI credits.
> v1.0 wires every flow except the AI seam call sites; gate primitive is
> ready to consume.

> **Scope note (deferred).** The plan-included recurring credit flow and
> the `PLAN_GRANT` priority tier are intentionally **not** implemented in
> v1.0. They re-enter scope alongside seat-based subscriptions; until
> then, `setMonthlyIncludedCredit`, `stopMonthlyIncludedCredit`, and the
> `actionApplyPlan` insiders harness referenced below do not exist in
> code. The design here is preserved as forward reference.

## Audience

- Core platform engineers
- Future agents working on billing, AI seam, webhook projector

## Purpose

Define the AI-credits system as a self-contained design covering every
production flow:

- **Top-up** — explicit $5–$1000 prepaid charge.
- **Auto-reload** — threshold-triggered recharge.
- **Plan-included credit** — monthly grant from a paid subscription.
- **Refund / revoke** — voluntary refund for unused balance.
- **Gate** — sub-100ms entitlement read for the AI seam.

What's deferred from v1.0: the AI seam call sites (`editor/lib/ai/server.ts`
wrapping `replicate`, `ai`, `@ai-sdk/*`, `openai`, etc.). The gate
primitive and the `ingestUsageEvent` function are ready; wiring is
mechanical.

---

## Constraints (this plan honors all of these)

These are the long-lived invariants. Where any of them changes, this doc
changes.

**Money model**

- AI is sold at cost. Zero markup on provider price. Margin comes from
  the base plan / seat fee, not from AI usage.
- Grida never loses money on a paid user under any realistic failure
  mode. Free users may lose up to $0.50/period (capped, accepted as CAC).
- **Top-up envelope.** Custom amount **$10–$500**. User pays a
  **flat-rate processing markup** on top of the credit amount; receives
  exactly $X of credit. The markup is `total = ceil((credit + 30) / 0.95)`
  — i.e. 5% gross-up plus a $0.30 buffer. Single safe envelope across
  every Stripe card type (US 2.9%+30¢, intl 3.9%+30¢, AmEx 3.5%+30¢,
  intl AmEx 4.4%+30¢, +1% currency conversion). Verified by
  `editor/scripts/billing/cli.ts markup-sim`; re-run when Stripe's
  rates change or the amount range changes. Implementation:
  `lib/billing/fees.ts > totalChargeForCredit()`. Applied at
  user-initiated Checkout (manual top-up + first auto-reload setup).
- **Auto-reload envelope.** Threshold ≥ $5 (whole dollars). Recharge
  target $25–$500 (whole dollars). Recharge target must exceed
  threshold. Same markup formula applies on the _initial_ setup
  Checkout. **Silent recharges thereafter run at-cost** — see
  [KI-BILL-001](./known-issues.md#ki-bill-001--silent-auto-recharge-runs-at-cost-markup-gap)
  for cause + planned fix. v1 mitigation: **auto-reload is gated behind
  an active paid subscription** so the loss is bounded by base-plan
  margin. Manual top-up is unaffected and remains free-tier accessible.
- Top-up credits never expire.
- Plan-bundled credits expire monthly (use-it-or-lose-it).
- Hard floor: AI is blocked when balance falls below **$0.25 (250 mills)**.
  No per-model pre-flight cost ceiling. Floor is a single global gate.
- No post-paid overage. Below floor → block + top-up CTA. There is no
  "use now, settle later" path.

**Identity & accounts**

- Billing subject is the **organization**, not the user. Every org has
  exactly one Stripe Customer and one Metronome Customer. Lazy-create at
  first paid intent.
- AI credit pools at the org level — one balance per org, regardless of
  seat count.

**Money denomination**

- Cents at every persistence layer (Stripe + Metronome both use cents).
  Sub-cent provider costs come in as `cost_mills` (1 mill = $0.001) on
  the ingest payload; Metronome's rate-card `unit_amount_decimal` does
  the per-mill math (`0.1` cents/mill).

**Source of truth**

- **Metronome** is source of truth for **credit balance**, grants, drain
  order, period rollover.
- **Stripe** is source of truth for **money** — payment intents,
  charges, refunds, subscription state. Metronome facilitates the charge
  via `payment_gate_config: STRIPE` on commits.
- **Our DB** is source of truth for **gate decisions** — boolean
  `customer_entitled` + cached balance, kept in sync via Metronome
  webhooks.

**Operational**

- Idempotent metering at every layer. `transaction_id` on Metronome
  ingest is the end-to-end idempotency key (34-day dedup window).
- All Stripe and Metronome webhook handlers dedup on event id at the DB
  layer (`stripe_event` / `metronome_event` tables, PK on event_id).

---

## Terminology

- **Top-up commit**: prepaid balance bought via Stripe-charged commit.
  Metronome charges the card, lands on success. Modeled with
  `payment_gate_config: STRIPE` + `invoice_schedule`.
- **Complimentary commit**: dev / promo / refund / manual grant. No
  Stripe charge.
- **Plan-included credit**: monthly recurring grant for a paid
  subscription. Modeled as a complimentary commit with multiple monthly
  schedule items (one per future month).
- **Auto-reload**: `prepaid_balance_threshold_configuration` on the
  contract — Metronome auto-charges when balance drops below threshold.
- **Gate**: pre-flight check on whether an AI call is allowed. Reads
  `grida_billing.account.customer_entitled` boolean.
- **Seam**: the single `editor/lib/ai/server.ts` file all AI calls go
  through. Not yet wired in v1.0.
- **Substrate**: the named Metronome resources (billable metric,
  products, rate card, rate) created out-of-band by
  `editor/scripts/billing/cli.ts setup:metronome`.

---

## Why Metronome (and not in-house, and not Stripe Billing Credits)

Three engines evaluated. Decision: **Metronome**.

- **Stripe Billing Credits** — applies only to subscription items using
  metered prices reporting through Meters. 100 unused-grants-per-customer
  cap. Two `category` values. Stripe themselves recommend Metronome for
  new integrations.
- **In-house FIFO ledger** — fully owned. Tempting for vendor
  independence, but commits us to maintaining FIFO/expiration math,
  period rollover, seat-prorate logic, drain-order discipline, audit
  trail, and invoice line-item display.
- **Metronome** — Stripe-acquired, the recommended path. Used by OpenAI,
  Anthropic, Databricks, NVIDIA. Native primitives for everything we
  need: customers, contracts, rate cards, prepaid commits, recurring
  credits, payment-gated commits with Stripe handoff,
  threshold-recharge, alert webhooks.

Trade-offs accepted: opaque pricing, two-system sync (Stripe + Metronome
webhooks both feed our state), vendor lock-in (bounded by Metronome's
data export to BigQuery / S3 / Snowflake).

---

## Architecture

### Single AI gateway seam (deferred from v1.0)

All AI calls in the editor pass through one file:
`editor/lib/ai/server.ts`. It is the only file allowed to import
`replicate`, `ai`, `@ai-sdk/*`, `openai`, or `@anthropic-ai/sdk`. Three
layers of enforcement:

1. **Lint** (oxlint `no-restricted-imports`) — direct provider imports
   outside the seam fail at lint.
2. **Runtime contract** — the seam's `withBilling()` wrapper requires an
   `organizationId`. No `organizationId` → throws.
3. **Audit script** — CI grep that flags any new file importing a
   provider SDK.

The gate primitive is ready (`getEntitlement(organizationId)` in
`@/lib/billing/metronome`). The seam itself is deferred — wiring the
existing AI route handlers through this seam is a separate, mechanical
PR.

### Two AI flow archetypes

**A. Media generation (single-shot)**

```
gate(local cache) → provider → ingest event to Metronome
                     ↓ on failure
                     no ingest (no charge)
```

Replicate predictions, image-tools, audio-gen, single image-gen. Cost
known post-hoc. No two-phase reservation needed; Metronome's
`transaction_id` dedup window is 34 days.

**B. Streaming / agentic (multi-turn, growing)**

```
gate(local cache, check entitled)
  ─▶ stream tokens (input + output)
  ─▶ tool calls (each may spawn nested provider calls — apply A above)
  ─▶ ingest event(s) on stream completion
       no ingest on cancellation
```

Tool calls inside the agent re-enter `withBilling` with their own gate.
Outer agent does not pre-allocate budget for tool spend; tools are
charged separately. If floor is breached mid-stream, the stream
terminates cleanly with a `BillingError` part.

### Top-up flow (Stripe-charged)

```
user clicks "Top up $X"
       ↓
addStripeChargedCommit(orgId, amountCents)
       ↓
    Metronome v2.contracts.edit + add_commits with:
      payment_gate_config: STRIPE / PAYMENT_INTENT
      invoice_schedule    (the line that gets charged)
      access_schedule     (what becomes available on success)
      priority            COMMIT_PRIORITY.TOPUP (90 — drains last)
       ↓
    Metronome charges Stripe synchronously
       ↓
    on success: commit lands, balance updates
    on failure: commit voided
       ↓
    webhook: payment_gate.payment_status (paid/failed)
       ↓
    fn_billing_apply_metronome_event:
      flips customer_entitled = true on success
       ↓
    refreshBalance: pulls current balance, updates cache
```

Critical anti-spoof rule: amounts always come from API parameters, never
from request metadata.

### Auto-reload (threshold-recharge)

```
setAutoReload(orgId, thresholdCents, rechargeAmountCents)
       ↓
    contracts.edit + add_prepaid_balance_threshold_configuration:
      threshold_amount, recharge_to_amount
      payment_gate_config: STRIPE
      commit: { product_id, applicable_product_ids, priority: TOPUP }
      is_enabled: true
       ↓
    persist enabled / threshold / amount to grida_billing.account
       ↓
    when balance drops below threshold:
       ↓
    Metronome auto-charges Stripe → commit added
       ↓
    same webhook flow as Top-up
```

### Plan-included credit (subscription monthly grant)

```
user upgrades to Pro → Stripe subscription activates
       ↓
[Stripe webhook handler — TODO: hook into existing projector]
       ↓
setMonthlyIncludedCredit(orgId, monthlyCents, monthsAhead)
       ↓
    contracts.edit + add_commits:
      access_schedule.schedule_items: 12 monthly slots, one per month
      priority: COMMIT_PRIORITY.PLAN_GRANT (10 — drains first)
      no invoice_schedule (complimentary; the plan fee paid for it)
       ↓
    Metronome materializes month-N grant on its starting_at boundary
       ↓
    each month, a new "segment" of the commit becomes accessible
       ↓
    webhook: commit.segment.start fires when a new month opens
       ↓
    refreshBalance keeps cache in sync
```

When user cancels: the access_schedule items past `cancel_at_period_end`
should be archived. Currently a manual op via `setMonthlyIncludedCredit`
re-call (which archives existing then adds replacement). Wire to
subscription-cancel webhook in next iteration.

### AI call flow (gate primitive ready)

```
[AI route handler — TODO]
       ↓
withBilling({ organizationId, kind, model_id }, op)
       ↓
getEntitlement(organizationId)        ← reads grida_billing.account
                                          (no Metronome round-trip)
       ↓
if !allowed: throw BillingError(reason)
       ↓
op(transactionId)  ← provider call
       ↓
on success: ingestUsageEvent(organizationId, costMills, { transactionId })
       ↓
fire-and-forget; Metronome dedups, drains commits per priority
       ↓
when commit hits zero: alerts.low_remaining_… webhook fires
       ↓
fn_billing_apply_metronome_event:
  flips customer_entitled = false
       ↓
next gate check returns BLOCKED until top-up
```

The gate **never** calls Metronome on the hot path. All gate reads
come from the local DB row.

### Drain order — `priority` discipline

Metronome's drain order is **not** "expires-soonest first by default."
The order is: tier (rollover commits → prepaid commits/credits →
postpaid commits) → `priority` integer (lower drains first) → 6-step
tiebreaker chain where `ending_before` is rule #6.

For us, all grants land in the prepaid tier. We assign `priority`
explicitly via `COMMIT_PRIORITY` (in `lib/billing/metronome.ts`):

| Grant type              | priority | Defined as                   |
| ----------------------- | -------- | ---------------------------- |
| Plan-included credit    | 10       | `COMMIT_PRIORITY.PLAN_GRANT` |
| Promo / refund / manual | 50       | `COMMIT_PRIORITY.PROMO`      |
| Top-up + auto-reload    | 90       | `COMMIT_PRIORITY.TOPUP`      |

Plan-included drains first (it expires monthly anyway), then promos,
then top-ups (they never expire — preserve them as long as possible).

### Refund flow

Metronome explicitly does not own refunds. Workflow:

1. User requests refund.
2. Compute `unused = original − consumed`. Spent portion is non-refundable.
3. Issue Stripe refund for the unused portion.
4. Call `revokeUnusedOnCommit(orgId, commitId)` — shrinks the commit's
   schedule amount to the consumed portion. Remaining balance becomes 0.
5. Audit row written; `refreshBalance` updates cache.
6. On forced chargeback, balance floors at zero; spent portion is logged
   as fraud loss.

### Reconciliation jobs (TODO — separate PR)

| Job                 | Compares                                                 | Cadence | On drift                                                                    |
| ------------------- | -------------------------------------------------------- | ------- | --------------------------------------------------------------------------- |
| **Balance**         | local `cached_balance_cents` ↔ Metronome `/listBalances` | hourly  | Reset cache. Flags missed webhooks if delta > $0.10.                        |
| **Orphan-usage**    | provider request lists ↔ local audit                     | daily   | Insert missing event; ingest with same `transaction_id` (Metronome dedups). |
| **Cost-card audit** | local recorded cost ↔ provider monthly invoice           | weekly  | Update cost cards; book diff as cost-of-goods.                              |

### Webhook security

- HMAC-SHA256 of `<Date_header>\n<raw_body>` keyed by the secret.
  Compared to `Metronome-Webhook-Signature` header.
- DB-backed dedup via `grida_billing.metronome_event` (PK on event_id).
- 5-minute freshness window (reject older events).
- `fn_billing_apply_metronome_event` is `SECURITY DEFINER` and idempotent
  by design (`INSERT ... ON CONFLICT DO NOTHING` on the event row).

Stripe webhook is parallel: `grida_billing.stripe_event` table,
`fn_billing_apply_stripe_event` projector. Already wired.

---

## Implementation map

| Concern                          | File                                                                             |
| -------------------------------- | -------------------------------------------------------------------------------- |
| Schema (account columns + dedup) | `supabase/migrations/20260508130000_grida_billing_metronome.sql`                 |
| Service module                   | `editor/lib/billing/metronome.ts`                                                |
| Webhook receiver                 | `editor/app/(ingest)/webhooks/metronome/route.ts`                                |
| Webhook projector RPC            | `public.fn_billing_apply_metronome_event` (in the migration)                     |
| Insiders QA harness              | `editor/app/(insiders)/insiders/billing/metronome/{page,_view,actions}.{tsx,ts}` |
| Substrate setup                  | `editor/scripts/billing/cli.ts setup:metronome` (and `setup:stripe`)             |
| Smoke / sandbox proofs           | `editor/scripts/billing/cli.ts smoke:{topup,auto-reload,webhook}` + `ping`       |

The service module exports:
`provisionOrg`, `addStripeChargedCommit`, `addComplimentaryCommit`,
`setAutoReload`, `disableAutoReload`,
`provisionZeroBalanceAlert`, `provisionLowBalanceAlert`,
`getEntitlement`, `refreshBalance`, `getOrgBalance`,
`ingestUsageEvent`, `ingestUsageEventGated`, `revokeUnusedOnCommit`.
(Plan-included helpers `setMonthlyIncludedCredit` /
`stopMonthlyIncludedCredit` were removed for v1.0; see scope note at
the top of this doc.)

---

## Open questions

| ID      | Question                                                                                                                                                                                                            |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Q-AI-2  | Mid-stream floor breach in agent flows: terminate cleanly with `BillingError` part, or finish with bounded overspend? (Defer to seam wiring.)                                                                       |
| Q-AI-6  | The user-facing doc promises features L1 doesn't deliver (~80%). Update doc, delay launch, or feature-flag to beta orgs?                                                                                            |
| Q-AI-10 | Cost-card source of truth: keep `editor/lib/ai/ai.ts` cards (current), or migrate to per-rate dimensional pricing in Metronome?                                                                                     |
| Q-AI-13 | Streaming agent + tool re-entry: tools re-gate against the floor each call; if floor breached mid-loop, terminate the agent cleanly. Spec the UX.                                                                   |
| Q-AI-14 | **Metronome pricing.** Public is "Contact sales." Need a sales conversation before we can model COGS. Blocks production launch.                                                                                     |
| Q-AI-15 | Customer hierarchy: ingest aliases (single contract, sub-org keys) vs account hierarchies (per-child contracts, parent commits, max 10 nodes). For Grida orgs with seats, ingest aliases probably suffice. Confirm. |
| Q-AI-16 | Free-tier $0.50 monthly credit: provision a Metronome customer at signup with a `setMonthlyIncludedCredit($0.50)` recurring grant? Or Free has no AI?                                                               |

### Resolved during research

- **Engine choice** — Metronome.
- **Reservation pattern** — replaced by Metronome's `transaction_id`
  idempotency.
- **Drain order configurability** — yes via `priority`; explicit per
  grant.
- **Top-up expiration** — never expires.
- **Refund pattern** — `editCommit` with `update_schedule_items.amount`
  shrinks remaining balance (`revokeUnusedOnCommit`).
- **Auto-reload pattern** — `prepaid_balance_threshold_configuration`
  with `payment_gate_config: STRIPE`.
- **Plan-included credit pattern** — multi-segment access schedule with
  `priority: PLAN_GRANT`.
- **Webhook signature scheme** — HMAC-SHA256 over `Date\n<body>`;
  verified by `fn_billing_apply_metronome_event`'s parent route.

---

## Phasing

1. **Phase 0 — Sales conversation with Metronome.** Get pricing.
   Resolves Q-AI-14. Required before production launch.
2. **Phase 1 — Schema + projector. ✅** Migration applied:
   `20260508130000_grida_billing_metronome.sql`.
3. **Phase 2 — Substrate + Metronome integration scaffolding. ✅**
   Service module, dev harness, all spike + smoke scripts.
4. **Phase 3 — Webhook receiver + DB-backed dedup. ✅** HMAC verified
   against the wire; `payment_gate.payment_status` event captured.
5. **Phase 4 — User-facing top-up CTA on settings page.** Wires to
   `addStripeChargedCommit` via a server action. Deferred — UI work.
6. **Phase 5 — Subscription event integration.** Hook the Stripe
   subscription projector to call `setMonthlyIncludedCredit` when the
   org transitions to Pro/Team. Deferred — touches the existing Stripe
   projector.
7. **Phase 6 — AI seam.** Wrap provider SDK call sites through
   `withBilling`. The gate + ingest primitives are ready.
8. **Phase 7 — Reconcile jobs.** Three jobs (balance, orphan-usage,
   cost-card) on cron.

---

## Risks

- **Metronome pricing is opaque.** Treat Phase 0 as the gate to
  production launch.
- **Public-doc gap.** L1 ships less than what `billing.mdx` promises.
  Either delay launch, gate behind a beta flag, or rewrite the public
  doc.
- **Two-system sync.** Metronome + Stripe webhooks both feed our state.
  Mitigated by the projector RPC's idempotency and the hourly balance
  reconcile (when wired).
- **Two idempotency keys.** Metronome events use `transaction_id`
  (34-day window); REST POSTs use `Idempotency-Key` header. Codified in
  the service module.
- **No native hard-block at zero.** Metronome accepts ingest past zero;
  the balance-zero alert webhook is what flips entitlement to false.
  Concurrency loss bound: events in-flight when the webhook arrives.
  Bounded by floor × concurrent clients per period.
- **Vendor lock-in.** Real but bounded by Metronome's data export
  facility.
- **Streaming-agent tool re-entry.** Tools re-gate against the floor
  each call; mid-loop breach terminates the agent cleanly.

---

## Manual QA via the insiders dev harness

Every flow is exercisable from
[/insiders/billing/metronome](<../../../editor/app/(insiders)/insiders/billing/metronome/_view.tsx>):

1. Enter an `organization_id` (bigint PK; e.g. `1` if you have one).
2. **Provision** → creates Metronome customer + contract, persists ids.
3. **Provision $0 alert** → creates the balance-zero alert.
4. **Charge Stripe + add commit** → real top-up via Stripe-charged
   commit. Metronome charges your test Stripe customer.
5. **Enable auto-reload** → configures threshold-recharge.
6. **Set monthly included credit** → L2 plan grant.
7. **Add complimentary commit** → promo / refund / manual grant.
8. **Ingest** → fires a usage event with `cost_mills`.
9. **Refresh balance (sync from Metronome)** → updates cache.
10. **Revoke unused** → click any commit_id in the live commits table;
    shrinks to consumed portion.

The "grida_billing.account" panel shows what the gate reads; the "Live
commits (Metronome)" panel shows the truth. They should agree after a
refresh.

---

## Appendix — relationship to existing artifacts

- `supabase/migrations/20260508130000_grida_billing_metronome.sql` —
  schema migration. Adds account columns + dedup table + projector.
- The earlier untracked `supabase/schemas/grida_ai.sql` is dropped
  entirely. Its `usage_grant`, `credit_balance_cache`, `usage_meter`
  designs are replaced by Metronome; the audit/cost-card pieces are
  deferred until needed.
- `editor/lib/billing/metronome.ts` — the service layer.
- `editor/lib/billing/index.ts` — Stripe surfaces (existing).
- `editor/app/(ingest)/webhooks/metronome/route.ts` — webhook receiver.
- `editor/scripts/billing/*` — substrate setup + every smoke / spike
  script that proved each flow against the sandbox.
- [docs/platform/billing.mdx](../../platform/billing.mdx) — user-facing
  doc; needs reconciliation with what L1 actually ships (Q-AI-6).
- [test/billing-quota-and-ai.md](../../../test/billing-quota-and-ai.md),
  [test/billing-payment-and-money-safety.md](../../../test/billing-payment-and-money-safety.md):
  manual-test corpus L1 must pass.
