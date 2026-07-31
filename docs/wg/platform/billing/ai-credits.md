---
title: AI Credits — Master Plan
description: Internal contract for prepaid organization credit, AI usage metering, top-ups, auto-reload, and future grant research.
format: md
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

> Companion to [docs/platform/billing.mdx](../../../platform/billing.mdx) (the
> user-facing promise). This doc says **how** we implement AI credits.
> v1.0 wires the prepaid-credit ledger, entitlement gate, and AI metering
> seam. Reconciliation jobs remain separate work.

> **Scope note.** The current billing-plan contract includes no recurring
> plan credit. Free and Pro use purchased organization credit. A recurring
> grant would require a new commercial decision before its product and
> lifecycle design could begin. Historical research is labeled explicitly
> below and is not current product behavior.

## Audience

- Core platform engineers
- Future agents working on billing, AI seam, webhook projector

## Purpose

Define the AI-credits system as a self-contained design covering every
production flow:

- **Top-up** — explicit $10–$500 prepaid charge.
- **Auto-reload** — threshold-triggered recharge.
- **Refund / revoke** — voluntary refund for unused balance.
- **Gate** — sub-100ms entitlement read for the AI seam.
- **Future research** — recurring plan grants, only after a new commercial
  decision defines whether such a benefit should exist.

The active AI seam is `editor/lib/ai/server.ts`. Billed first-party routes use
its gate → provider call → usage ingest contract. Any new billed call site
must enter through that seam rather than import a provider around it.

---

## Constraints (this plan honors all of these)

These are the long-lived invariants. Where any of them changes, this doc
changes.

**Money model**

- AI is sold at provider cost, with payment processing passed through on
  user-initiated purchases. Margin comes from the base plan or Custom terms,
  not from AI usage.
- Complimentary credit is an explicit promotional grant, not an automatic
  Free-plan allowance.
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
- A recurring plan grant, if commercially approved in the future, would need
  an explicit expiration policy. No such grant exists today.
- Hard floor: AI is blocked when balance falls below **$0.25 (250 mills)**.
  No per-model pre-flight cost ceiling. Floor is a single global gate.
- No post-paid overage. Below floor → block + top-up CTA. There is no
  "use now, settle later" path.

**Identity & accounts**

- Billing subject is the **organization**, not the user. Every org has
  exactly one Stripe Customer and one Metronome Customer. Lazy-create at
  first paid intent.
- AI credit pools at the org level — one balance per org, regardless of
  membership count.

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
- **Recurring plan grant (future research only)**: a possible complimentary
  grant tied to a subscription. It is not part of the current Free or Pro
  contract and has no current implementation.
- **Auto-reload**: `prepaid_balance_threshold_configuration` on the
  contract — Metronome auto-charges when balance drops below threshold.
- **Gate**: pre-flight check on whether an AI call is allowed. Reads
  `grida_billing.account.customer_entitled` boolean.
- **Seam**: the single `editor/lib/ai/server.ts` surface billed first-party AI
  calls go through for gating and usage ingest.
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
  need: customers, contracts, rate cards, prepaid commits, possible future
  recurring credits, payment-gated commits with Stripe handoff,
  threshold-recharge, alert webhooks.

Trade-offs accepted: opaque pricing, two-system sync (Stripe + Metronome
webhooks both feed our state), vendor lock-in (bounded by Metronome's
data export to BigQuery / S3 / Snowflake).

---

## Architecture

### Single AI gateway seam

All billed first-party AI calls in the editor pass through one file:
`editor/lib/ai/server.ts`. It is the only file allowed to import
`replicate`, `ai`, `@ai-sdk/*`, `openai`, or `@anthropic-ai/sdk`. Three
layers of enforcement:

1. **Lint** (oxlint `no-restricted-imports`) — direct provider imports
   outside the seam fail at lint.
2. **Runtime contract** — the seam's gate and transaction wrappers require an
   `organizationId`. No valid organization id → refuse before provider spend.
3. **Audit script** — CI grep that flags any new file importing a
   provider SDK.

The seam uses `getEntitlement(organizationId)` from
`@/lib/billing/metronome` before provider spend and ingests observed or
request-priced usage after the call. GG text, image, and video routes use this
contract today. BYOK text is the explicit non-billable carve-out.

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

Tool calls inside the agent re-enter the billing seam with their own gate.
The outer agent does not pre-allocate budget for tool spend; tools are charged
separately. An in-flight request completes if the balance crosses the floor;
the next model or tool step is refused by its pre-flight gate.

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

### Recurring plan credit (future research, not current)

Free and Pro include no recurring AI-credit grant. Grida Gateway (GG) usage is
metered against prepaid organization credit purchased separately. No service
API, priority constant, subscription projector, or scheduled implementation
phase creates plan credit today.

A grant would begin with a new commercial decision defining eligibility,
amount, expiration, cancellation, refunds, and its relationship to purchased
credit. Only then should an implementation design be selected.

**Historical research, not current behavior:** an earlier design considered a
multi-segment complimentary commit that expired monthly and drained before
purchased credit. That rationale is retained only as an option to re-evaluate;
none of its proposed symbols or flows belongs to the current contract.

### AI call flow

```
[billed AI route handler]
       ↓
billing seam ({ organizationId, feature, model_id }, op)
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

Current grants land in the prepaid tier. The runtime assigns `priority`
explicitly via `COMMIT_PRIORITY` (in `lib/billing/metronome.ts`):

| Current credit type     | priority | Defined as              |
| ----------------------- | -------- | ----------------------- |
| Promo / refund / manual | 50       | `COMMIT_PRIORITY.PROMO` |
| Top-up + auto-reload    | 90       | `COMMIT_PRIORITY.TOPUP` |

Promos drain before top-ups; top-ups never expire and are preserved as long as
possible. Historical plan-grant research proposed an earlier priority for an
expiring grant, but the current runtime defines no plan-grant priority.

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

| Concern                          | File                                                                       |
| -------------------------------- | -------------------------------------------------------------------------- |
| AI gate + metering seam          | `editor/lib/ai/server.ts`                                                  |
| Schema (account columns + dedup) | `supabase/migrations/20260508130000_grida_billing_metronome.sql`           |
| Service module                   | `editor/lib/billing/metronome.ts`                                          |
| Webhook receiver                 | `editor/app/(ingest)/webhooks/metronome/route.ts`                          |
| Webhook projector RPC            | `public.fn_billing_apply_metronome_event` (in the migration)               |
| Insiders QA harness              | `editor/app/(insiders)/insiders/billing/{page,_view,actions}.{tsx,ts}`     |
| Substrate setup                  | `editor/scripts/billing/cli.ts setup:metronome` (and `setup:stripe`)       |
| Smoke / sandbox proofs           | `editor/scripts/billing/cli.ts smoke:{topup,auto-reload,webhook}` + `ping` |

The service module exports:
`provisionOrg`, `addStripeChargedCommit`, `addComplimentaryCommit`,
`setAutoReload`, `disableAutoReload`,
`provisionZeroBalanceAlert`, `provisionLowBalanceAlert`,
`getEntitlement`, `refreshBalance`, `getOrgBalance`,
`ingestUsageEvent`, `ingestUsageEventGated`, `revokeUnusedOnCommit`.
No recurring plan-grant service API exists.

---

## Open questions

| ID      | Question                                                                                                                                                                                                                           |
| ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Q-AI-10 | Cost-card source of truth: keep the shared `@grida/ai-models` catalogue (current), or migrate to per-rate dimensional pricing in Metronome?                                                                                        |
| Q-AI-14 | **Metronome pricing.** Public is "Contact sales." Need a sales conversation before we can model COGS. Blocks production launch.                                                                                                    |
| Q-AI-15 | Customer hierarchy: ingest aliases (single contract, sub-org keys) vs account hierarchies (per-child contracts, parent commits, max 10 nodes). Confirm whether any future hierarchy needs more than one contract per organization. |

### Resolved during research

- **Engine choice** — Metronome.
- **Reservation pattern** — replaced by Metronome's `transaction_id`
  idempotency.
- **Mid-stream floor breach** — finish the in-flight request; the next model
  or tool step re-gates and is refused. There is no post-paid settlement path.
- **Drain order configurability** — yes via `priority`; explicit per
  grant.
- **Top-up expiration** — never expires.
- **Refund pattern** — `editCommit` with `update_schedule_items.amount`
  shrinks remaining balance (`revokeUnusedOnCommit`).
- **Auto-reload pattern** — `prepaid_balance_threshold_configuration`
  with `payment_gate_config: STRIPE`.
- **Historical plan-credit research** — a multi-segment access schedule with
  an early drain priority was considered. It is not a current contract or
  implementation; a new commercial decision must precede any revisit.
- **Public allowance contract** — Free and Pro include no recurring AI-credit
  grant. Credit is purchased separately.
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
5. **Phase 4 — User-facing top-up CTA on settings page. ✅** Owner-initiated
   purchases use Stripe Checkout, then land prepaid organization credit.
6. **Future research — recurring plan grant.** Not an implementation phase.
   The current plan contract includes no recurring grant; a new commercial
   decision must precede any product or technical design.
7. **Phase 6 — AI seam. ✅** Billed first-party call sites use the live gate →
   provider call → usage ingest contract.
8. **Phase 7 — Reconcile jobs.** Three jobs (balance, orphan-usage,
   cost-card) on cron.

---

## Risks

- **Metronome pricing is opaque.** Treat Phase 0 as the gate to
  production launch.
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
- **Streaming-agent tool re-entry.** Tools re-gate against the floor on each
  call. An in-flight request can overspend the floor, but the next step is
  refused.

---

## Manual QA via the insiders dev harness

Every flow is exercisable from the dev-only `/insiders/billing` harness
([source](https://github.com/gridaco/grida/blob/main/editor/app/%28insiders%29/insiders/billing/_view.tsx)):

1. Enter an `organization_id` (bigint PK; e.g. `1` if you have one).
2. **Provision** → creates Metronome customer + contract, persists ids.
3. **Provision $0 alert** → creates the balance-zero alert.
4. **Charge Stripe + add commit** → real top-up via Stripe-charged
   commit. Metronome charges your test Stripe customer.
5. **Enable auto-reload** → configures threshold-recharge.
6. **Add complimentary commit** → promo / refund / manual grant.
7. **Ingest** → fires a usage event with `cost_mills`.
8. **Refresh balance (sync from Metronome)** → updates cache.
9. **Revoke unused** → click any commit_id in the live commits table;
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
- [docs/platform/billing.mdx](../../../platform/billing.mdx) — user-facing
  billing contract. It must not promise recurring plan credit without a new
  commercial decision and matching implementation.
- [test/desktop-settings-billing-credits.md](https://github.com/gridaco/grida/blob/main/test/desktop-settings-billing-credits.md)
  is the focused manual acceptance test for the credit settings surface.
- `editor/lib/billing/__tests__/e2e/` is the guarded local-Supabase and
  Stripe-test suite for webhook delivery and credit top-up. The deprecated
  composite billing specs remain historical records, not current release
  gates.
