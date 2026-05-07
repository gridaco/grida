---
id: TC-BILLING-OPS-000
title: User-facing UX, observability, and operational edge cases
module: billing
area: ops
tags: [ux, dashboard, observability, audit, edge-case, clock, schema, ops]
status: untested
severity: high
date: 2026-05-05
updated: 2026-05-05
automatable: partial
covered_by: []
---

## Behavior

The billing model is invisible if it works. These cases verify that users see clear, accurate information about their plan, allowance, and any blocking states — and that operators have the audit trail and tooling to respond. Plus the long tail of "what about this weird thing" production resilience cases.

---

## User-facing UX

### TC-BILLING-OPS-001 — Dashboard shows accurate remaining allowance

User has used 30% of this month's allowance. The dashboard says so.
**Expected:** Numbers match the underlying counter exactly. Updates within 1 second of any new usage.

### TC-BILLING-OPS-002 — Approaching the cap — soft warning

Remaining drops below 20%.
**Expected:** A non-blocking notice appears: "You've used 80% of this month's AI." No alarm; no modal.

### TC-BILLING-OPS-003 — Allowance exhausted — hard block UI

Used reaches the cap. User clicks "Generate."
**Expected:** Inline message: "AI quota exhausted. Resets in N days. Upgrade to keep using." With an upgrade button. No top-up CTA in v1.

### TC-BILLING-OPS-004 — Past-due banner

Pro user goes past_due.
**Expected:** Persistent banner: "Your card was declined. Update payment to restore AI access." Click → Customer Portal.

### TC-BILLING-OPS-005 — Cancel-at-period-end banner

User cancels with X days remaining.
**Expected:** Banner: "Subscription canceled. AI access ends MMM DD." Reactivation button → Customer Portal.

### TC-BILLING-OPS-006 — Plan switch confirmation shows allowance delta

User clicks "Upgrade to Team."
**Expected:** Confirmation dialog clearly states the per-seat price change AND the new monthly AI allowance for this period.

### TC-BILLING-OPS-007 — Multi-org user sees correct org context

User belongs to 3 orgs and switches between them.
**Expected:** The shown allowance is for the active org. No leakage between orgs.

### TC-BILLING-OPS-008 — Cross-org read is prevented

A user attempts to read another org's allowance directly via the API.
**Expected:** Empty result. Membership-based access control.

### TC-BILLING-OPS-009 — Owner can see usage event log

Owner navigates to Billing → Usage History.
**Expected:** Per-call log: timestamp, model, kind, cost, who. Paginated. Default to last 30 days.

### TC-BILLING-OPS-010 — Non-owner cannot see audit log

A regular member queries the audit endpoint.
**Expected:** Forbidden or empty.

### TC-BILLING-OPS-011 — Anonymous unauthenticated query

No user session at all.
**Expected:** All billing views return empty. No data leakage.

### TC-BILLING-OPS-012 — Long stretches of zero usage

User on Pro doesn't use AI for 3 months.
**Expected:** Each month displays "0 used of allowance." No errors. No accumulation.

### TC-BILLING-OPS-013 — Per-user breakdown (future)

Owner asks: who in my team is using the most AI?
**Expected:** A view summing per-actor usage by period. The data is captured today; the report is a future UI feature.

### TC-BILLING-OPS-014 — Per-model breakdown

Owner asks: which models are eating my allowance?
**Expected:** Per-kind aggregates available without scanning every event. Per-model breakdown is a separate query if needed.

### TC-BILLING-OPS-015 — Time-zone display

User in UTC+9 sees billing period bounds.
**Expected:** Displayed in the user's local time. Underlying storage stays UTC.

### TC-BILLING-OPS-016 — Currency display

Internal accounting unit is mills; UI always shows USD.
**Expected:** No internal-unit terminology leaks into the UI.

---

## Operational edge cases — clocks, schemas, infrastructure

### TC-BILLING-OPS-017 — Database clock skew vs Stripe clock

Stripe sends an event whose timestamp is 30s ahead of our database clock.
**Expected:** Stripe's timestamp is used for forensic display; our own state transitions use our own time. Don't compare Stripe timestamps to our `now()` for correctness decisions.

### TC-BILLING-OPS-018 — App restart loses in-flight gate decisions

Server crashes between pre-flight "allowed" and the provider call.
**Expected:** No provider call, no usage record, allowance unchanged. User retries; sees the same available allowance.

### TC-BILLING-OPS-019 — App restart loses in-flight provider calls

Server crashes after the provider call but before recording.
**Expected:** Reconciliation cron sees an orphan provider request and inserts the missing usage record retroactively.

### TC-BILLING-OPS-020 — Database connection pool exhausted under load

1000 concurrent gate calls; pool size 50.
**Expected:** Latency rises; some calls queue. Beyond a wait threshold, app returns 503. No data corruption.

### TC-BILLING-OPS-021 — Schema migration runs while live traffic flows

A migration adds a new column.
**Expected:** Online ALTER, no table rewrite. Live traffic unaffected. Test in staging first.

### TC-BILLING-OPS-022 — Restore from backup mid-period

DR scenario: restore yesterday's snapshot.
**Expected:** Today's usage records are lost. Allowance counters revert. Stripe is unchanged (separate system). Document the resync runbook.

### TC-BILLING-OPS-023 — Stripe write succeeds but local write fails

A code path commits to Stripe but our database write fails.
**Expected:** Reconciliation catches the drift (e.g. a Stripe subscription we don't track). Document the eventual-consistency tolerance.

### TC-BILLING-OPS-024 — Multi-region read replicas

Reads from a stale replica show outdated allowance.
**Expected:** The gate must read from the primary, not a replica. Document.

### TC-BILLING-OPS-025 — Forensic snapshot size explosion

A buggy logger writes massive snapshots on every event (10KB each).
**Expected:** No schema-level limit, but storage compresses. Alert on table-size growth velocity.
**Niche:** With 10M events/month × 10KB = 100GB/month if uncapped. Document and consider capping snapshot size.

### TC-BILLING-OPS-026 — New plan added mid-period

A new plan tier is introduced. Existing users are unaffected; users who upgrade to the new plan get its allowance immediately.
**Expected:** No retroactive changes to existing periods.

### TC-BILLING-OPS-027 — Plan removed from catalogue

Hypothetical: a plan is discontinued.
**Expected:** Existing subscriptions on that plan continue working. The plan's allowance config must remain available to the gate or every call from those orgs would block.
**Niche:** Never delete plan config rows; mark them as discontinued. Document.

### TC-BILLING-OPS-028 — Seasonal pricing change

Holiday promo: Pro at a discount for one month.
**Expected:** Document the migration approach — new plan rows, new Stripe prices, or both. Existing subscriptions stay on their original plan unless explicitly migrated.

### TC-BILLING-OPS-029 — Stripe webhook source-IP whitelist drift

Stripe adds new webhook source IPs; our firewall blocks them.
**Expected:** Out of scope for billing logic, but document: webhook delivery should not depend on IP filtering — signature verification is the real auth.

### TC-BILLING-OPS-030 — Email delivery failure on past-due notification

The email provider is down when we try to send "your card declined."
**Expected:** Email is queued and retried. The state change in our system does not depend on email succeeding.

### TC-BILLING-OPS-031 — Idempotency key reuse across distinct calls

App accidentally sends the same Stripe idempotency key for two genuinely different subscribe attempts.
**Expected:** Stripe returns the original response; the second attempt is silently a no-op. Ensure idempotency keys are per-attempt, not per-user.

### TC-BILLING-OPS-032 — Cost-card audit job fails silently

The job throws but no alerting is wired.
**Expected:** Job failure must page ops. Document monitoring expectations.

### TC-BILLING-OPS-033 — Org exists but billing setup is incomplete

A bug or migration race left an org without its billing account record.
**Expected:** First gate call lazily provisions or falls back to the Free allowance. User can still use AI. A nightly fix-up job inserts missing records.

### TC-BILLING-OPS-034 — Webhook arrives for an org that no longer exists

Stripe webhook for a customer whose org was hard-deleted.
**Expected:** Handler fails gracefully (recorded as an error). Ops resolves manually.

### TC-BILLING-OPS-035 — Hot-org contention

A celebrity org has thousands of users hammering AI simultaneously. The single allowance counter is a hotspot.
**Expected:** Updates serialize on the row. Latency may climb but no corruption.
**Niche:** Worst case the meter becomes a bottleneck. Future mitigation: shard the counter per-(org, hour) for very hot orgs.
