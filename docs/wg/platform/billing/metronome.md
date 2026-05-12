---
title: Metronome — Billing Infrastructure
tags:
  - internal
  - wg
  - platform
  - billing
status: implemented
---

| feature id  | status      | description                                                                                             | PRs |
| ----------- | ----------- | ------------------------------------------------------------------------------------------------------- | --- |
| `metronome` | implemented | Metronome integration: prepaid credit substrate, threshold-recharge, webhook projector, drift detector. | —   |

# Metronome — Billing Infrastructure

> Architectural reference for our Metronome integration. This is the
> **infrastructure layer** that the [AI Credits master plan](./ai-credits.md)
> sits on top of. AI Credits is the product feature; this doc is how the
> billing substrate underneath it actually works, what Metronome owns,
> what we own, and the documented gotchas.

## Audience

- Core platform engineers
- Future agents working on billing, the AI seam, or the webhook projector
- Anyone debugging a billing issue at 2am

## Purpose

Describe the long-lived shape of our Metronome integration: the
substrate, the building blocks we layer on top, the user journey from
provisioning through steady-state usage and recovery, and the gotchas
we have already documented from sandbox spikes.

This doc deliberately avoids implementation identifiers (function
names, file paths, class names). Those rot; the concepts here do not.
For implementation, see [AI Credits master plan](./ai-credits.md) which
maps the building blocks below to current code.

---

## Terminology

**Metronome's own concepts (used verbatim — these are stable external API names):**

- **Customer** — Metronome's per-org entity. Billing subject.
- **Contract** — the container for commits, rate cards, alert configs,
  and threshold configs attached to a Customer.
- **Commit** — a unit of credit on a contract. Has an `access_schedule`
  (when/how much becomes available), an optional `invoice_schedule`
  (charge it via Stripe), and a `priority` (drain order tiebreaker).
- **Recurring Credit** — a commit whose access schedule has multiple
  monthly segments; refreshes automatically.
- **Billable Metric** — Metronome's definition of how raw usage events
  aggregate into a billable quantity.
- **Rate Card** — pricing for a contract; maps a metric to a price.
- **Product** — Metronome's catalog object. We use a USAGE Product
  (priced per metric) and a FIXED credit Product (the unit that commits
  are denominated in).
- **`payment_gate_config`** — flag on a commit or threshold config that
  routes the charge through Stripe.
- **`prepaid_balance_threshold_configuration`** — the auto-recharge
  config on a contract. Fires a Stripe charge when balance drops below
  threshold.
- **Events**: `payment_gate.threshold_reached`,
  `payment_gate.payment_status`,
  `payment_gate.payment_pending_action_required`,
  `alerts.low_remaining_*`, `commit.create`, `contract.edit`.
- **`transaction_id`** — idempotency key on usage ingest. 34-day
  dedup window.

**Our layer (semantic names — these are how we talk about our own components):**

- **Credit account** — per-org DB row that holds Metronome linkage IDs,
  cached balance, cached entitlement boolean, and cached auto-reload
  config. The gate primitive reads this row.
- **Substrate** — the named Metronome resources (Billable Metric,
  USAGE Product, FIXED credit Product, Rate Card, Rate) created
  out-of-band and looked up by name at runtime.
- **Provisioner** — idempotent match-or-create routine for the
  Metronome Customer + Contract + Stripe billing provider configuration
  on the Customer.
- **Gate primitive** — sub-100ms entitlement check read by the AI seam
  before every provider call. Local DB read; never hits Metronome.
- **Webhook projector** — HMAC-verified inbound endpoint that consumes
  Metronome webhook events, dedups by event id, and reconciles the
  credit account.
- **Live state reconciler** — the write→read→reconcile pattern: after
  any contract mutation, we read the contract back from Metronome and
  derive cache from the live state. The DB is never ahead of Metronome.
- **Drift detector** — pairs cached state against a live read; flags
  divergence as "dropped webhook" so debugging surfaces the layer that
  broke.
- **Commit operations** — the two flavors of credit grant we issue
  today: Stripe-charged top-up and complimentary grant. Plan-included
  recurring credit is deferred (re-introduced when seat-based
  subscriptions land).

---

## Roles — who owns what

| System             | Source of truth for                                                            |
| ------------------ | ------------------------------------------------------------------------------ |
| **Metronome**      | Credit balance, drain order, recharge mechanism, usage aggregation             |
| **Stripe**         | Money movement (charges, refunds, payment methods, subscription state)         |
| **Credit account** | Gate decision (entitled true/false), cached balance, cached auto-reload config |

Metronome facilitates Stripe charges via `payment_gate_config: STRIPE`
on commits and on the threshold configuration. The credit account is a
read-side projection updated by Metronome webhooks and by the live
state reconciler.

---

## Building blocks

### Substrate

Five named Metronome resources are created out-of-band and looked up by
name at runtime:

- a Billable Metric (the unit we ingest usage against)
- a USAGE Product (carries the metric and its rate)
- a FIXED credit Product (the unit commits are denominated in — we
  use a $1.00-per-credit denomination so commits can be expressed in
  cents directly)
- a Rate Card (the contract's pricing surface)
- a Rate on the Rate Card mapping the USAGE Product to a price using
  `unit_amount_decimal` for sub-cent precision

These resources are conventionally named. Our layer never tries to
create them at request time; if they are missing, provisioning fails
loudly. This keeps Metronome's catalog clean and makes the substrate
reviewable as a single artifact.

### Credit account

One row per organization. Holds:

- Metronome `Customer` ID (linkage)
- Metronome `Contract` ID (linkage)
- cached balance in cents
- cached entitlement boolean
- cached auto-reload state (enabled / threshold / recharge amount)

The gate primitive reads this row. Webhooks write to this row. The
live state reconciler is the only path that overwrites cached values
from a fresh Metronome read.

### Provisioner

Idempotent. Match-or-create the Metronome Customer + Contract for the
org, then ensure the Customer carries a Stripe billing provider
configuration so threshold-recharge can charge a card. Self-heals
legacy state: if a Customer exists without the configuration (e.g. an
older provisioning run), the next provisioner pass attaches it.
Re-running the provisioner is always safe.

### Commit operations

Two flavors today, each landing as a Metronome `Commit` on the contract:

| Operation             | Charges Stripe? | Drain priority      | Use case                                 |
| --------------------- | --------------- | ------------------- | ---------------------------------------- |
| Stripe-charged top-up | yes             | TOPUP (drains last) | user-initiated $5–$1000 prepaid purchase |
| Complimentary grant   | no              | PROMO (middle)      | promo / refund / manual ops grant        |

Both are commits on the same contract. The drain priority scheme
encodes "use promos before paid balance":

```
PROMO (50) < TOPUP (90)
```

Lower priority drains first. This is the cookbook pattern from
Metronome's prepaid-credits launch guide; integers are arbitrary as
long as the relative order holds. A third tier (plan-included
recurring credit, drains first) is reserved for the seat-based
subscription milestone and deliberately not implemented today.

### Auto-reload configuration

A `prepaid_balance_threshold_configuration` on the contract: when
balance falls below `threshold_amount`, Metronome fires a Stripe
charge to bring balance back to `recharge_to_amount` and lands the
result as a new TOPUP-priority commit. Keyed off the Stripe
`payment_gate_config` on the contract.

Configuration is mirrored into the credit account so the gate read
and the settings UI do not have to call Metronome to display
"auto-reload is on."

### Gate primitive

A sub-100ms read of the credit account: returns "entitled" iff
`customer_entitled = true` AND cached balance ≥ floor. Read from local
DB; never hits Metronome. The AI seam consults this before every
provider call.

This is the primary cookbook recommendation: cache `customer_entitled`
locally and gate on it. The cache is kept in sync by webhooks. There
is no fast-path call to Metronome on the request critical path.

### Ingest pipeline

Post-call cost emission to Metronome's `usage.ingest`. Each event
carries:

- the org's Metronome Customer ID
- the metric name
- the cost (in mills, so sub-cent costs are representable)
- a `transaction_id` (idempotency key, 34-day dedup window)

The `transaction_id` is the end-to-end idempotency key for the call.
Metronome dedups; replays are safe.

### Webhook projector

HMAC-SHA256 verification on the inbound webhook (over `Date\n<body>`),
then DB-backed dedup on event id, then dispatch by event type. Each
event type reconciles a different slice of the credit account:

| Event                                          | Reconciles                                                            |
| ---------------------------------------------- | --------------------------------------------------------------------- |
| `commit.create`                                | balance after a new commit lands                                      |
| `payment_gate.threshold_reached`               | recharge starting (informational)                                     |
| `payment_gate.payment_status` (paid)           | recharge succeeded; reconcile balance + entitlement                   |
| `payment_gate.payment_status` (failed)         | recharge declined; auto-reload has been disabled; entitlement off     |
| `payment_gate.payment_pending_action_required` | 3DS / SCA needed; surface to the user                                 |
| `alerts.low_remaining_*`                       | balance crossed an alert threshold; flip entitlement off when at zero |

The projector is idempotent by design: the dedup row on event id is
the lock.

### Live state reconciler

After any contract mutation, the pattern is:

1. Write to Metronome (e.g. `contract.edit` adding a commit)
2. Read the contract back from Metronome
3. Derive cached balance / entitlement / auto-reload state from the
   live response
4. Write the derived state to the credit account

This guarantees the DB is never ahead of Metronome. If step 2 fails,
the cache is left stale and the next webhook (or a manual refresh)
will reconcile it.

### Drift detector

Pairs the cached state against a fresh live read. If they disagree
beyond a small tolerance, log a "drift" record. The only way for
cache and live to disagree is a dropped webhook (or a webhook that
arrived but failed to project). Surfacing drift is how we discover
the upstream layer that broke; refreshing from live always fixes the
cache.

---

## User journey

### 1. First sign-in

Org is provisioned in our system. No Metronome Customer or Contract
yet. Credit account row exists with empty linkage IDs and entitled =
false.

### 2. First top-up

User links a Stripe payment method. Then they click "Top up $X":

- Provisioner runs (match-or-create Metronome Customer + Contract,
  ensure Stripe billing provider configuration on the Customer)
- Stripe-charged commit is added to the contract
- Metronome charges Stripe synchronously
- On success, the commit lands; balance becomes $X
- `payment_gate.payment_status` (paid) webhook arrives; projector
  flips entitlement on, refreshes cached balance
- Live state reconciler also runs as part of the top-up call, so the
  UI does not have to wait for the webhook

### 3. Steady-state usage

For each AI call:

- AI seam reads gate primitive (sub-100ms local read)
- If entitled: provider is called
- On success: cost is ingested to Metronome with a fresh
  `transaction_id`
- Metronome aggregates usage events asynchronously and drains
  commits per the priority scheme

The gate never calls Metronome on the hot path.

### 4. Auto-reload kicks in

- Balance drops below threshold
- Metronome's threshold detector flips the threshold state (within
  ~3 minutes of the breach-causing ingest, see Gotchas)
- `payment_gate.threshold_reached` webhook arrives (informational)
- Metronome charges Stripe; takes ~2 seconds end-to-end
- New TOPUP-priority commit lands
- `payment_gate.payment_status` (paid) webhook arrives; projector
  refreshes cache
- Entitlement remains on; balance is back at `recharge_to_amount`

### 5. Payment failure path

- Stripe declines the auto-recharge
- Metronome **automatically disables** the threshold configuration
  (the contract's `is_enabled` field is set to `false`)
- Metronome does **not** retry failed payments
- `payment_gate.payment_status` (failed) webhook arrives; projector
  flips entitlement off
- User sees the "AI blocked" state with a CTA
- Recovery is manual: user updates payment method, then we re-enable
  the threshold configuration on the contract

### 6. Voluntary refund

- Compute the consumed portion of the original commit
- Issue a Stripe refund for the unused portion
- Edit the commit's `access_schedule.amount` down to the consumed
  portion (Metronome's documented refund pattern; Metronome does not
  own refunds)
- Webhook + reconciler refresh the cache; balance now reflects the
  refund

---

## Documented gotchas

### Three-minute evaluation cadence, five-minute outer bound

Metronome's threshold detector evaluates **at least every three minutes**;
alerts fire **within five minutes** of the breach-causing ingest. This is
documented behavior. From [Metronome — Create and manage alerts](https://docs.metronome.com/manage-product-access/create-manage-alerts/):

> "Notifications will fire within 5 minutes of the usage triggering the
> breach of the threshold being ingested."

> "The threshold is evaluated at least once every three minutes."

This cadence is the dominant latency in the recharge cycle.

### Auto-recharge is "asynchronous" with no SLA

From [Metronome — Launch a prepaid credits business model](https://docs.metronome.com/launch-guides/prepaid-credits/):

> "Metronome handles all of the recharge actions asynchronously based
> on customer usage."

There is no published SLA on how fast a recharge completes. Empirically
it completes within the documented 5-minute outer bound, but the system
must be designed assuming a recharge gap exists.

### Decomposition of the recharge wait (real measurements)

Measured from our sandbox during spike testing:

| Stage                                                   | Observed time   |
| ------------------------------------------------------- | --------------- |
| Metronome eval pipeline (T0 ingest → T1 charge created) | ~3 min          |
| Stripe processing + Metronome's post-charge webhook     | ~2 sec          |
| Our projector + DB write                                | sub-100 ms      |
| **Total observed**                                      | **~3 min 12 s** |

Well within the 5-minute documented bound. Metronome's eval cadence is
~99% of the wall-clock wait; Stripe and our layer are noise.

### The "empty window"

When burn rate exceeds the eval cadence, balance can hit $0 before the
recharge lands. The gate primitive refuses calls during this window;
the recharge eventually lands; the system self-heals.

This is **expected behavior**, not a bug. The prepaid-credits cookbook
explicitly accepts that customers can hit zero — the cookbook does not
commit to "balance won't burn during the recharge window." The
designed response is the gate refusing during the gap.

### Empty window is unlikely in production

Real AI burn is fractions of a cent per call, far below the eval
cadence. The empty window is observable during synthetic / test
traffic or true burst traffic, not during normal usage. Setting
`threshold_amount` substantially above peak burn-per-3-minutes is
sufficient to make the empty window practically unreachable.

### Payment failure auto-disables the threshold config

From [Metronome — Set prepaid balance thresholds](https://docs.metronome.com/guides/customers-billing/optimize-customer-experience/prepaid-balance-thresholds):

> "the contract's `is_enabled` field is set to `false`"

> "Metronome does not automatically retry failed payments."

Recovery is manual: customer updates card, we re-enable the threshold
configuration. This is by design — Metronome does not want to retry a
declined card on a 3-minute loop.

### Three webhook events for the recharge cycle, not two

Production must handle all three:

- `payment_gate.threshold_reached` — recharge is starting
- `payment_gate.payment_status` — paid or failed
- `payment_gate.payment_pending_action_required` — 3DS / SCA
  authentication needed

Skipping the third leaves SCA-required users stuck.

### Drift between cache and live = dropped webhook

The only way for the credit account cache to disagree with Metronome
is a dropped webhook (network failure, projector error, dedup row
inserted but state not applied). The drift detector exists to surface
exactly this. A refresh-from-live always reconciles. Monitor drift
incidence as a proxy for webhook delivery health.

### Stripe is fast enough to be irrelevant

Stripe processing + Metronome's post-charge webhook is consistently
~2 seconds, dominated entirely by Metronome's eval cadence. Tuning
Stripe-side latency is not where engineering effort goes.

### Streaming billable metrics exist for sub-second eval

Metronome offers streaming billable metrics with sub-second
evaluation, but they are not part of the prepaid-credits cookbook and
we are not using them. They use simpler aggregations (COUNT, SUM, MAX)
and would require a metric definition refactor. Defer until
call-cost-per-eval-window genuinely justifies it.

### What we are NOT relying on

The prepaid-credits cookbook does **not** commit to "balance will not
burn during the recharge window." The cookbook explicitly accepts that
customers can hit zero; the design response is the gate primitive
refusing during the gap. The next reader should understand that the
recharge gap is by-design, not a bug to fix.

---

## Cookbook compliance

Comparison against Metronome's [prepaid-credits launch guide](https://docs.metronome.com/launch-guides/prepaid-credits/):

| Cookbook item                                         | Status                                                         |
| ----------------------------------------------------- | -------------------------------------------------------------- |
| Cache `customer_entitled` in your DB                  | done                                                           |
| Pattern: `if (entitled) { do_action(); ingest() }`    | done                                                           |
| Set $0-balance alert per customer                     | partial — exists but not auto-provisioned at customer creation |
| Webhook flips entitlement off when alert fires        | done                                                           |
| Auto-recharge flips entitlement back on               | done                                                           |
| Handle `payment_gate.payment_status: failed`          | not yet                                                        |
| Handle `payment_gate.payment_pending_action_required` | not yet                                                        |

Three known divergences from cookbook (each is a tracked gap, not a
deliberate deviation):

- Failed-recharge handling is not yet wired
- 3DS / SCA event handling is not yet wired
- $0-balance alert is not auto-attached during provisioning

---

## References

External documentation (treat as canonical as long as Metronome
remains the billing engine):

- [Metronome — Launch a prepaid credits business model](https://docs.metronome.com/launch-guides/prepaid-credits/)
- [Metronome — Set prepaid balance thresholds](https://docs.metronome.com/guides/customers-billing/optimize-customer-experience/prepaid-balance-thresholds)
- [Metronome — Create and manage alerts](https://docs.metronome.com/manage-product-access/create-manage-alerts/)
- [Metronome — Create billable metrics](https://docs.metronome.com/connect-metronome/create-billable-metrics/)
- [Metronome — Send usage events](https://docs.metronome.com/connect-metronome/send-usage-events/)

Companion documents in this WG:

- [AI Credits — Master Plan](./ai-credits.md) — the product feature
  built on top of this substrate; maps the building blocks above to
  current implementation files.

---

## Longevity statement

This document is expected to remain valid across:

- Service module rewrites
- Schema iterations on the credit account
- Webhook projector refactors
- Agent turnover

As long as:

- Metronome remains the credit / contract / threshold engine
- Stripe remains the money-movement engine
- The drain priority scheme (PROMO → TOPUP) holds

If any of those change, this document must be revisited.
