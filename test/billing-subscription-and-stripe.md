---
id: TC-BILLING-SUB-000
title: Subscription lifecycle, seats, and Stripe consistency
module: billing
area: subscription
tags: [stripe, subscription, seats, webhook, consistency, money-safety]
status: untested
severity: critical
date: 2026-05-05
updated: 2026-05-05
automatable: partial
covered_by: []
---

## Behavior

Everything that touches subscription state and the Stripe-side mirror: lifecycle transitions, seat counting, webhook ordering, and reconciliation. The two non-negotiable invariants:

1. **Grida never loses money.** No path grants more usage than was paid for.
2. **No double-spending.** Cancelling and resubscribing in the same billing period must not yield two periods' worth of usage.

---

## Lifecycle — create, upgrade, downgrade, cancel, resubscribe

### TC-BILLING-SUB-001 — Free org provisioned on signup

A user signs up. An organization is auto-created on the Free plan. No Stripe customer exists yet.
**Expected:** The new org has the Free monthly allowance available immediately. No Stripe charges, no Stripe customer record yet.

### TC-BILLING-SUB-002 — Free → Pro upgrade mid-period preserves used

Solo user on Free has used 60% of this month's allowance. They upgrade to Pro (1 seat). Stripe issues a prorated invoice.
**Expected:** The org's allowance jumps to the Pro level. Already-used amount stays counted. Remaining = Pro allowance minus what was already used.
**Niche:** The allowance must never shrink mid-period as a side-effect of an upgrade.

### TC-BILLING-SUB-003 — Free → Pro upgrade resets the period to the Stripe billing cycle

A Free org tracks the calendar month. After upgrading to Pro mid-month, the active period switches to the Stripe billing cycle for that subscription.
**Expected:** A new period begins immediately, aligned to the Stripe cycle. The prior calendar-month usage is closed for forensics.
**Niche:** The user effectively gets a fresh allowance because they entered a paid billing cycle. Confirm intentional vs. abuse: a user could plan upgrades to maximize overlap.

### TC-BILLING-SUB-004 — Pro → Team upgrade mid-period via Customer Portal

3-seat Pro org has used most of its allowance. Owner switches to Team via Customer Portal.
**Expected:** Same period boundaries continue. Allowance recomputes to the Team level for 3 seats. Already-used carries over. Remaining grows.
**Niche:** Plan switch on the same subscription does NOT start a new period.

### TC-BILLING-SUB-005 — Team → Pro downgrade mid-period (used > new ceiling)

5-seat Team org has used more than the Pro ceiling at 5 seats would allow. Owner downgrades to Pro mid-period.
**Expected:** Current period's allowance does NOT shrink. User can continue using up to the previous (higher) ceiling. Next period uses the lower Pro ceiling.

### TC-BILLING-SUB-006 — Team → Pro downgrade mid-period (used < new ceiling)

Same setup but used is well within the new Pro ceiling.
**Expected:** Current period's ceiling stays at the higher Team value (no clawback). Stripe's prorated CREDIT does not retroactively shrink the user's experience.

### TC-BILLING-SUB-007 — Cancel-at-period-end keeps allowance until period end

Pro user clicks Cancel in Customer Portal. Period ends 18 days later.
**Expected:** Full allowance remains spendable for the next 18 days. At period end, the org reverts to Free with a fresh calendar-month allowance.
**Niche:** The Free allowance is honored on the _next_ calendar month, not stacked on top of any leftover Pro allowance.

### TC-BILLING-SUB-008 — Cancel and resubscribe same day with same plan

User cancels Pro mid-period. Stripe issues a prorated refund. Same user resubscribes 2 hours later.
**Expected:** A new billing cycle starts. The new period gets a fresh allowance; the old period's usage does not carry forward.
**Niche:** Verify net cost vs net allowance is honest. Two prorated invoices funding two prorated allowances is fine; two prorated invoices funding two full allowances is the abuse case to look for.

### TC-BILLING-SUB-009 — Cancel and resubscribe with different plan (Pro → Team)

User cancels Pro 5 days into period, resubscribes to Team same day.
**Expected:** Old subscription marked canceled. New Team subscription begins now; allowance reflects the Team ceiling.

### TC-BILLING-SUB-010 — Reactivate immediately after cancel-at-period-end

User clicks Cancel-at-period-end. 1 hour later they reactivate in Customer Portal.
**Expected:** Cancellation is undone on the same subscription. No new subscription is created. Allowance unchanged.

### TC-BILLING-SUB-011 — Subscription created but invoice not yet paid (incomplete)

User checks out Pro. Stripe places the subscription in `incomplete` because the card requires 3DS. User abandons the challenge.
**Expected:** AI is blocked. After ~24h, Stripe transitions to `incomplete_expired`; AI remains blocked.
**Niche:** No allowance is granted on `subscription_create` alone — only after `invoice.payment_succeeded`.

### TC-BILLING-SUB-012 — Annual subscription should refresh allowance monthly

User upgrades to annual Pro for $192/yr.
**Expected:** Each calendar month the AI allowance refreshes. The user does NOT receive 12 months of allowance up front.
**Niche:** Open gap if period bounds are read straight from the Stripe annual cycle. Annual needs separate monthly bookkeeping.

### TC-BILLING-SUB-013 — Subscription period shorter than calendar month (e.g. 28 days)

February signup: subscription cycle is 28 days. Next cycle also 28 days.
**Expected:** Each cycle covers its actual span. Same monthly value across all months regardless of length.

### TC-BILLING-SUB-014 — Subscription anniversary on Feb 29, leap year

User subscribes on Feb 29, 2028. Next year's renewal: Feb 28 or Mar 1?
**Expected:** Stripe's behavior governs; verify our system accepts whichever Stripe chooses without error.

### TC-BILLING-SUB-015 — Subscription paused

User pauses subscription via Customer Portal.
**Expected:** AI access is blocked while paused. Resume restores access.
**Niche:** A paused user does NOT silently fall back to the Free allowance.

### TC-BILLING-SUB-016 — Org with no active subscription at all (data corruption)

A bug or race leaves an org without any subscription record.
**Expected:** The system gracefully treats the org as Free with the calendar-month allowance. The AI gate does not crash.

### TC-BILLING-SUB-017 — Org deleted while subscription is active

Owner deletes the org via the workspace UI while a paid subscription is running.
**Expected:** The org and its records are removed. **Stripe continues to charge** unless the application explicitly cancels the subscription first.
**Niche:** Document the dependency: app must cancel Stripe sub BEFORE deleting org. A delete that skips this leaves the user being billed indefinitely with no service.

### TC-BILLING-SUB-018 — Subscription transferred between orgs (admin op)

Ops manually moves a paid subscription from org A to org B (e.g. user changed legal entity).
**Expected:** Org A loses paid access; org B gains it. Historical usage stays attributed to the original org.

### TC-BILLING-SUB-019 — Trial subscription (future feature)

Spec the expected shape for when trials ship.
**Expected:** During a trial the user has the full plan allowance at no charge. If the card fails at trial end, status flips to past_due and AI is blocked.

### TC-BILLING-SUB-020 — Two active subscriptions on one org should be impossible

A bug attempts to create a second active subscription for the same org.
**Expected:** The system refuses (DB-level uniqueness or app-level guard). One active subscription per org, always.

---

## Seats — quantity sync, drift, ownership

### TC-BILLING-SUB-021 — Add member to Pro increases the allowance immediately

3-seat Pro org. Admin invites Bob; Bob accepts.
**Expected:** Seat count becomes 4. Per-seat allowance multiplies up. Next AI call sees the new ceiling.

### TC-BILLING-SUB-022 — Remove member shrinks future allowance, not current

4-seat Pro org with most of its allowance already used. Admin removes Charlie.
**Expected:** Current period's allowance is preserved (already paid for). Next period reflects the lower seat count. Stripe issues a prorated credit on the next invoice.

### TC-BILLING-SUB-023 — Add member to Free is a no-op for billing

4-member Free org. Add 5th member.
**Expected:** Seat count stays effectively 1; the Free allowance is org-level and does not multiply by member count.

### TC-BILLING-SUB-024 — Pending invitation does NOT count

Admin invites Dave. Dave hasn't accepted.
**Expected:** Seat count unchanged. Bill unchanged.

### TC-BILLING-SUB-025 — Owner is a billable seat

Solo Pro user. Owner pays for their own seat.
**Expected:** No "owner-free" exemption. The owner's per-seat fee is charged.

### TC-BILLING-SUB-026 — Last member removed from Pro org

Solo Pro user removes themselves (or org gets transferred and the new owner removes the old).
**Expected:** Seat count is floored at 1. Subscription stays valid until explicitly canceled.
**Niche:** A 0-quantity Stripe sub would zero-bill; flooring at 1 keeps the sub charging.

### TC-BILLING-SUB-027 — Rapid add/remove does not lose updates

Admin adds 10 members in quick succession via API.
**Expected:** Final seat count = old count + 10. No lost increments.

### TC-BILLING-SUB-028 — Add member while subscription is past_due

3-seat Pro org went past_due. Admin (somehow allowed) adds a 4th member.
**Expected:** Seat count grows. AI stays blocked (past_due overrides). When the card recovers, the new larger allowance applies.
**Niche:** UX should warn the admin: adding a seat during past_due locks in a future bigger bill.

### TC-BILLING-SUB-029 — Remove member from past_due Pro org

**Expected:** Seat count decreases. AI still blocked. Future allowance reflects fewer seats.

### TC-BILLING-SUB-030 — Removing the org owner leaves ownership stale

Owner removes themselves from the member list.
**Expected:** Seat count decreases. The org's ownership pointer is now stale.
**Niche:** App should refuse "remove self if owner". Ownership must be transferred explicitly first.

### TC-BILLING-SUB-031 — Local seat count drifts from Stripe seat count

Webhook flap: our records show 4 seats, Stripe shows 3.
**Expected:** Reconciliation job (daily) detects and alerts. Document which side wins: the local view (we set it) or Stripe (the billing source).
**Niche:** Possible loss = 1 seat × per-seat × period until reconciled. Document the tolerance.

### TC-BILLING-SUB-032 — Member add succeeds locally but fails to sync to Stripe

Local trigger fires, audit recorded; subsequent Stripe API call fails.
**Expected:** Local seat count = 4, Stripe stays at 3. Reconciliation job re-pushes. Until then, user has more allowance than they paid for.

### TC-BILLING-SUB-033 — Member belongs to multiple orgs

Alice is in 2 Pro orgs.
**Expected:** Each org has its own subscription, seat count, and allowance. Independent.

### TC-BILLING-SUB-034 — Service-account / bot member

A bot user is added to a Pro org.
**Expected:** Today bots count as billable seats. Document for the future when seat tiers (e.g. viewer-free) are introduced.

### TC-BILLING-SUB-035 — Member added before account record exists (race)

A bug or migration creates a membership row before the org's billing account is provisioned.
**Expected:** The system handles it gracefully — no error, no missed seat sync once the account catches up.

### TC-BILLING-SUB-036 — Member removed via cascade (org deleted)

Org deleted. All members removed in cascade.
**Expected:** Cascade unwinds without errors even though the parent subscription is also being deleted.

### TC-BILLING-SUB-037 — Same user double-added (race)

Two simultaneous "add member" calls for the same (org, user).
**Expected:** Only one membership row is created. Seat count increases by 1, not 2.

---

## Stripe consistency — webhooks, ordering, reconciliation

### TC-BILLING-SUB-038 — Webhook delivered out of order: updated before created

`customer.subscription.updated` arrives before `.created`.
**Expected:** The first handler creates the local record; the second event no-ops or updates the same record. Final state is correct regardless of order.

### TC-BILLING-SUB-039 — Webhook delivered duplicately

Stripe delivers the same event twice (rare but documented).
**Expected:** The first delivery handles the event. The second delivery detects the replay and does nothing.

### TC-BILLING-SUB-040 — Webhook handler crashes mid-handling

Mid-handler exception rolls back the work.
**Expected:** A separate forensic record is written so we can see why it failed. Stripe retries; the handler runs again on retry. No silent loss.

### TC-BILLING-SUB-041 — Handler succeeds but receiver crashes before responding 200

Side-effects committed; the HTTP response never reaches Stripe.
**Expected:** Stripe retries. The replay detects "already handled" and returns success. No double-handling.

### TC-BILLING-SUB-042 — Local seat count differs from Stripe seat count (drift)

Reconciliation discovers Stripe says 5, we say 4.
**Expected:** Alert fires. Document the canonical direction (trust local, push to Stripe — or trust Stripe, fix locally).

### TC-BILLING-SUB-043 — Stripe shows canceled, we still show active

Webhook missed.
**Expected:** Reconciliation pulls Stripe state daily, detects cancellation, updates locally. AI access blocks within 24h.

### TC-BILLING-SUB-044 — We show canceled, Stripe still shows active

Inverse. User has paid but is being denied.
**Expected:** Reconciliation un-cancels locally OR cancels on Stripe per policy. This direction is the worse one for user trust — detect early.

### TC-BILLING-SUB-045 — Stripe customer ID drift

Our records link the org to one Stripe customer; a webhook arrives claiming the same org via a different customer.
**Expected:** Refuse or alert. Don't silently overwrite the customer link.

### TC-BILLING-SUB-046 — Multiple Stripe customers per org (data corruption)

**Expected:** The system rejects a second customer attachment to the same org.

### TC-BILLING-SUB-047 — Stripe webhook secret rotated, old secret still in env

**Expected:** Webhook signature verification fails; we return 400. Stripe retries until it gives up. Ops must update the env. Document the runbook.

### TC-BILLING-SUB-048 — Stripe API rate limit hit during a checkout burst

Many new signups concurrently exceed Stripe's create-customer rate limit.
**Expected:** App catches and either retries with backoff or surfaces "try again" UX. No partial state.

### TC-BILLING-SUB-049 — Webhook delivered after a 6-hour delay

Stripe queues delivery because our endpoint was unreachable.
**Expected:** Handler still works (idempotent). State catches up.
**Niche:** Bounded loss = 6h × user's call rate during the window where status was inconsistent.

### TC-BILLING-SUB-050 — Two webhooks for the same logical event arrive concurrently

Possible after a Stripe region failover.
**Expected:** Only one handler runs to completion; the other no-ops via deduplication.

### TC-BILLING-SUB-051 — Cancellation expressed two ways at once

Customer Portal cancels via the newer cancel-at timestamp; the webhook payload has both the legacy boolean and the timestamp.
**Expected:** The system normalizes both — if either implies "cancel at period end," treat the subscription as scheduled to cancel.
