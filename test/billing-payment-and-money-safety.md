---
id: TC-BILLING-PAY-000
title: Payment failure, dunning, fraud, topups, refunds
module: billing
area: payment
tags: [stripe, dunning, past_due, fraud, abuse, money-safety, topup, refund]
status: untested
severity: critical
date: 2026-05-05
updated: 2026-05-05
automatable: partial
covered_by: []
---

## Behavior

The never-lose-money rule is the spine of these cases. A failed payment must block AI immediately. A past-due user must NOT silently fall back to the free allowance. Topups are deferred to a later release; cases below spec the expected behavior so that release has acceptance criteria ready.

---

## Payment failure and dunning

### TC-BILLING-PAY-001 — Card declines on the first invoice

User upgrades to Pro. Stripe attempts to charge; card declines.
**Expected:** Subscription enters an unpaid state (incomplete or past_due). AI is blocked. The user sees a clear "payment didn't go through" message.

### TC-BILLING-PAY-002 — Card declines on monthly renewal

Active Pro user; renewal date arrives; card declined.
**Expected:** AI is blocked within seconds of the failure webhook.
**Niche:** Measure latency from webhook to blocked. Acceptable: under 30 seconds at p99.

### TC-BILLING-PAY-003 — Smart Retries succeeds on attempt 2

Card declined on attempt 1; succeeds on attempt 2 a few days later.
**Expected:** Subscription returns to active. Allowance is restored to the plan level for the current period.

### TC-BILLING-PAY-004 — Smart Retries exhausted

After all retries fail, Stripe sets the subscription to unpaid or canceled per dunning settings.
**Expected:** AI stays blocked. Stripe sends its own cancellation email; our app reflects the canceled state on the next webhook.

### TC-BILLING-PAY-005 — Past-due user does NOT get a free fallback

Pro user goes past_due. Their allowance is zero.
**Expected:** Gate blocks. App may suggest "fix payment" but does NOT silently degrade to the Free $0.50 monthly.

### TC-BILLING-PAY-006 — User updates card during past-due

Past-due user adds a new card via Customer Portal. Stripe immediately retries.
**Expected:** On payment success, status flips to active and allowance is restored.

### TC-BILLING-PAY-007 — Card declines mid-period after partial use

Pro user used 70% of allowance before card declined.
**Expected:** Used amount stays where it was — don't zero it. When the card recovers, allowance returns to its full level minus what was already used.
**Niche:** Some platforms reset the meter on recovery. We don't.

### TC-BILLING-PAY-008 — Card declines exactly at period rollover

Renewal hits exactly at the boundary; card declines.
**Expected:** Old period closes normally. New period starts with zero allowance because the new period's payment failed. No spurious "fresh allowance" race.

### TC-BILLING-PAY-009 — Webhook delayed 2 hours

The "payment failed" webhook is delayed by Stripe.
**Expected:** During the 2-hour gap, the user has full allowance. Once the webhook arrives, AI blocks.
**Niche:** Bounded loss = 2h × user's call rate, capped by remaining allowance.

### TC-BILLING-PAY-010 — Webhook delivery permanently fails

Stripe retries for 3 days, then gives up.
**Expected:** The reconciliation cron pulls subscription state from Stripe daily, detects status drift, and fixes locally. Acceptable detection window: 24 hours.

### TC-BILLING-PAY-011 — Customer disputes a charge (chargeback opens)

User opens a Visa/Mastercard dispute on a Pro charge.
**Expected:** Stripe's dispute webhook arrives. Per policy, the org is flagged and the subscription is suspended (or scheduled to cancel). AI access ends per the chosen policy.
**Niche:** Document the policy. Without auto-suspend, user keeps paid-feature access until the natural cancellation.

### TC-BILLING-PAY-012 — Chargeback reversed in our favor

Stripe rules in our favor; funds returned.
**Expected:** Subscription status restored; no allowance change.

### TC-BILLING-PAY-013 — Chargeback lost

Stripe rules in cardholder's favor; funds lost plus the dispute fee.
**Expected:** Subscription canceled. AI blocked. The dispute fee is unavoidable; document as accepted loss.

### TC-BILLING-PAY-014 — Card on file is about to expire

Stripe sends an expiration notice well before the actual expiry.
**Expected:** App emails the user to update their card. No allowance effect yet.

### TC-BILLING-PAY-015 — Customer Balance positive at cancellation

User cancels Pro with leftover Stripe-side balance from a past topup (future feature).
**Expected:** Per documented policy, refund or roll forward for re-subscribe. Do not silently keep the user's money.

### TC-BILLING-PAY-016 — Stripe is down for an hour

Stripe API returns errors for an hour.
**Expected:** Existing subscriptions keep working (allowance reads are local). Webhooks queue and deliver when Stripe recovers. New checkouts fail gracefully with a "try again" message.

### TC-BILLING-PAY-017 — Account-level fraud lock by Stripe

Stripe locks our entire Stripe account (e.g. compliance review).
**Expected:** All webhooks stop. All checkouts fail. Existing users continue spending allowance. No revenue, no new signups. Operational alert.

### TC-BILLING-PAY-018 — Renewal invoice for $0 (trial / coupon)

Edge: a coupon or trial extension makes the renewal invoice zero.
**Expected:** Subscription stays active. Allowance is granted normally. No division-by-zero or other arithmetic surprise.

---

## Fraud and abuse vectors

### TC-BILLING-PAY-019 — Stolen card subscribes to Pro and burns AI

Bad actor uses a stolen card to buy Pro, makes ~$2 of image generations, then disputes.
**Expected:** Stripe Radar may catch some. If not: the chargeback flips status, AI blocks. We've already paid the provider for those generations.
**Niche:** Per-org loss bounded by the period's allowance. Across many such actors, loss adds up. Mitigations: Stripe Radar rules, 3DS in EU.

### TC-BILLING-PAY-020 — Disposable email mass signup for the Free pool

Attacker signs up 1000 free orgs with disposable emails to harvest the free $0.50 monthly each.
**Expected:** 1000 × $0.50 = $500/month gift.
**Niche:** Mitigations: email verification, captcha at signup, signup-rate limiting, blocklist of disposable email domains. Document which are in place.

### TC-BILLING-PAY-021 — Delete-and-recreate org for fresh allowance

User burns through Free allowance, deletes org, creates a new org from the same account, gets a fresh allowance.
**Expected:** Today's design allows it (no per-user lifetime limit). Loss = unbounded.
**Niche:** Mitigation: per-user (not per-org) free quota cap, OR rate-limit org creation per user. Document policy.

### TC-BILLING-PAY-022 — Same user pays for Pro on multiple orgs

Heavy user creates 5 orgs, each on Pro, gets 5× the allowance.
**Expected:** Not fraud — they paid for it. Pattern suggests they should be on a Team plan instead. No action required.

### TC-BILLING-PAY-023 — Topup + refund + already-spent (future)

User funds a $25 topup, spends $2 of it, then disputes the topup. Stripe refunds.
**Expected:** Topup balance drops by $25 → goes negative. We've already paid the provider for the spent portion. Loss = $2.
**Niche:** Mitigations: hold-period on topups before usable, OR enforce non-negative balance.

### TC-BILLING-PAY-024 — Past-due user with unspent topup disputes the topup

User has topup balance from before going past_due. Disputes the topup.
**Expected:** Stripe reverses; balance drops to zero or negative. Bounded loss = topup amount.

### TC-BILLING-PAY-025 — Support social-engineering for free credit

Attacker convinces support to issue a manual credit grant. Spends it.
**Expected:** Mitigations: multi-person approval for grants, audit log review, capped grant size per ticket.

### TC-BILLING-PAY-026 — Coordinated multi-account: shared API token

10 users each on Free, sharing access via a backend proxy. Effective shared pool = $5.
**Expected:** Each account stays within its own allowance. Total loss = 10 × Free monthly = $5/month, treated as CAC.

### TC-BILLING-PAY-027 — Race the gate: many concurrent calls

Attacker scripts 100 concurrent AI calls when 100 mills remain.
**Expected:** All pre-flights pass concurrently. All record. Used = 100 + 99 × call_cost.
**Niche:** Worst case overshoot = (concurrent_count − 1) × max_per_call_cost per period. Document and accept, OR serialize the gate (slow).

### TC-BILLING-PAY-028 — Webhook spoofing

Attacker sends a forged "payment succeeded" webhook to our endpoint.
**Expected:** Stripe signature verification rejects it before any state changes.

### TC-BILLING-PAY-029 — Replay an old subscription event

Attacker captures a real subscription-create event and replays it.
**Expected:** The event id is recognized as already processed; the replay does nothing.

### TC-BILLING-PAY-030 — Topup amount injection via metadata

Attacker submits a checkout with an inflated amount in metadata while paying only the minimum.
**Expected:** The amount granted comes from the actual payment total, NOT from arbitrary metadata.
**Niche:** This is a real vulnerability vector — verify the amount source is the trustworthy field, not metadata.

### TC-BILLING-PAY-031 — Org takeover via member-promotion bug

A member becomes owner, removes the original owner, and changes payment / cancels for refund.
**Expected:** Out of scope for billing (auth/authorization), but the billing layer must accept ownership changes cleanly.

### TC-BILLING-PAY-032 — Pre-flight passes, attacker rapidly invokes thousands of calls

1000 calls in 100ms; all see the same remaining; all proceed.
**Expected:** All recorded. Used = (start) + 999 × call_cost. Loss bounded by max parallel × max cost.
**Niche:** Same as the concurrency race, taken to extreme. Mitigation: per-IP rate limit on the AI endpoint as a separate rail.

---

## Topups (future) and refund handling

### TC-BILLING-PAY-033 — Topup checkout success funds Stripe Customer Balance

User clicks "Top up $25". Stripe Checkout completes successfully.
**Expected (future):** Webhook funds the customer balance on Stripe and refreshes the local cache within seconds.

### TC-BILLING-PAY-034 — Topup amount below minimum rejected

User tries to topup below the minimum.
**Expected:** App refuses at checkout creation, before any payment is collected.

### TC-BILLING-PAY-035 — Topup amount above maximum rejected

User tries to exceed the maximum.
**Expected:** Refused.

### TC-BILLING-PAY-036 — Topup user pays processing fee on top

User selects $25 of credit.
**Expected:** Card charged the topup amount plus the card-processor fee. Customer Balance receives the full topup amount.
**Niche:** UI preview must match the server charge to the cent.

### TC-BILLING-PAY-037 — 3DS challenge timeout on topup

User initiated topup; 3DS prompt times out.
**Expected:** Stripe marks payment incomplete. No balance funded. User sees "didn't complete" with a retry option.

### TC-BILLING-PAY-038 — Topup during past-due

Pro user is past_due. They top up to keep using AI.
**Expected (future):** Topup succeeds. Plan allowance stays zero; topup balance is spendable. The gate falls through: "no allowance → topup balance → allow."
**Niche:** Critical for the "card declined but I still need to use AI right now" UX.

### TC-BILLING-PAY-039 — Topup balance never expires

User tops up, uses some, cancels subscription, returns 6 months later.
**Expected (future):** Balance remains.

### TC-BILLING-PAY-040 — Subscription refund on cancellation

User cancels Pro mid-period and asks for prorated refund (out-of-policy normally).
**Expected:** Per ops decision, Stripe issues the refund. Subscription status itself is unaffected unless ops also cancels it.

### TC-BILLING-PAY-041 — Topup refund — partially used

User topped up, used some of it, then asks for refund.
**Expected (future):** Refund only the unused portion. Document policy: do we ever refund the used portion?

### TC-BILLING-PAY-042 — Topup refund — fully used

User topped up, used all of it, then disputes.
**Expected (future):** Refund processes via Stripe. We've already paid the provider. Loss = topup amount.
**Niche:** Same vector as the "disputed topup" cases. Mitigation: hold-period before usable.

### TC-BILLING-PAY-043 — Manual ops grant

Ops issues a manual goodwill credit after a P1 incident.
**Expected:** The customer's available amount goes up. The grant is logged in the audit trail.

### TC-BILLING-PAY-044 — Manual ops grant during canceled state

User has canceled, but ops wants to give them a final goodwill credit anyway.
**Expected:** Document the policy — either provision a temporary subscription or refuse the grant. Don't leave canceled-with-credit in an undefined state.
