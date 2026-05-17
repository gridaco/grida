---
id: TC-BILLING-AI-000
title: Quota tracking, periods, AI gate, and usage recording
module: billing
area: ai
tags: [quota, period, ai, gate, idempotency, race, provider, cost]
status: untested
severity: critical
date: 2026-05-05
updated: 2026-05-05
automatable: partial
covered_by: []
---

## Behavior

Every plan includes a monthly AI allowance. Free is org-wide; Pro and Team scale per seat. Periods follow the Stripe billing cycle for paid plans and the calendar month for Free.

Each AI request goes through a pre-flight check ("does this fit in the remaining allowance?"), then the provider, then a usage record. The cost-passthrough integrity (we charge what the provider charges us) and money-loss bounds depend on this sequence behaving correctly under concurrency, replays, and provider weirdness.

---

## Period boundaries — math, time, edges

### TC-BILLING-AI-001 — Call exactly at the period boundary

A user's billing period ends at exactly midnight UTC on the 1st. They make a call at exactly that timestamp.
**Expected:** The system attributes the call deterministically to one period or the other — never both, never neither.

### TC-BILLING-AI-002 — Call straddles a period boundary (long-running)

A long predict-time call starts at 23:59:50 UTC and finishes at 00:00:05 UTC, crossing midnight.
**Expected:** The cost is recorded against whichever period the call completes in. Recorded once, not split.

### TC-BILLING-AI-003 — Daylight Savings transitions

Periods are tracked in UTC.
**Expected:** No DST conversions in the gate path. User-facing display may convert; the underlying period math does not.

### TC-BILLING-AI-004 — Org created at the exact month boundary

Free user signs up at exactly midnight UTC on the 1st. First call happens 1ms later.
**Expected:** They get the new month's allowance, not the previous month's.

### TC-BILLING-AI-005 — Free user with abandoned org returns 6 months later

User signed up in December, didn't use AI, returns in June.
**Expected:** No accumulated allowances. June starts fresh. No backfill needed for the missing months.

### TC-BILLING-AI-006 — Allowance integer overflow safety

Hypothetical org with 100,000 seats on Team would compute an allowance large enough to exceed a 32-bit signed integer.
**Expected:** Either the seat count is bounded at ingestion, or the allowance representation is wide enough not to overflow. First call from such an org must not silently wrap.

### TC-BILLING-AI-007 — Past_due Pro user has zero allowance

Pro user goes past_due.
**Expected:** Every AI request blocks. Audit log shows the blocks. No infinite-retry loop.

### TC-BILLING-AI-008 — Used equals allowance, requested = 0

Idle browser polls the gate; used equals allowance; requested = 0.
**Expected:** Allowed. Don't spuriously block when nothing is requested.

### TC-BILLING-AI-009 — Used equals allowance, requested = 1 mill

Same setup, requested = 1 mill.
**Expected:** Blocked.

### TC-BILLING-AI-010 — Single huge call larger than the entire allowance

Pro user, 10000-mill allowance, single call estimated to cost 15000 mills.
**Expected:** Pre-flight refuses up front. User is told to upgrade or wait.

### TC-BILLING-AI-011 — Concurrent calls both pass pre-flight, both record, total goes over

Two browser tabs hit the gate at the same instant when 100 mills remain. Each call costs 80 mills. Both pre-flight checks see "100 remaining" and proceed.
**Expected:** Both calls succeed. Final used exceeds allowance by 60 mills (~$0.06).
**Niche:** Documented bound on concurrency loss: at most (concurrent_clients − 1) × max_per_call_cost per period. Mitigation would require serializing the gate, which costs latency.

### TC-BILLING-AI-012 — Period rolled at Stripe but webhook arrives late

The Stripe billing cycle advances at midnight; the local view is still on the old period at 02:00.
**Expected:** Reconciliation catches the drift within 24h. Documented detection window.
**Niche:** Real failure mode — Stripe may advance internally before firing a webhook.

### TC-BILLING-AI-013 — Subscription period bounds are missing (data corruption)

A bug or edge leaves the local period bounds null.
**Expected:** The gate falls back to calendar-month bounds. Users continue to function; no crash.

### TC-BILLING-AI-014 — Same period, two usage rollup rows (data corruption / race)

A bug attempts to create two usage-rollup rows for the same (org, period).
**Expected:** The system prevents this at the storage layer. Test the guard, not just the app code.

### TC-BILLING-AI-015 — Ops manually adjusts a usage rollup

Support adjusts a customer's used amount to honor a goodwill credit.
**Expected:** Allowed via privileged tooling. The adjustment is logged in the audit trail.

### TC-BILLING-AI-016 — Free org with many members shares one pool

3-member Free org. All 3 members hit AI in the same hour.
**Expected:** They share the single Free monthly pool. First-come, first-serve. Once exhausted, all members are blocked.
**Niche:** No per-member fairness in v1. Document as known.

### TC-BILLING-AI-017 — Mid-period seat count fluctuates

Pro 3 seats → owner adds 2 → 5 seats → removes 1 → 4 seats. All in one period.
**Expected:** The current period's allowance climbs as seats are added and STAYS at the high-water mark. Removing a seat does not shrink the current period's allowance.

### TC-BILLING-AI-018 — Subscription period extends mid-cycle (annual switch)

Pro monthly user switches to Pro annual. Stripe extends the cycle on the same subscription from monthly to annual.
**Expected:** Open gap — the annual cycle would change the period bounds. Annual needs separate monthly allowance bookkeeping. Document until annual is implemented.

### TC-BILLING-AI-019 — Plan's allowance configuration is missing

Catalogue seed bug: the row for a plan is missing.
**Expected:** Allowance defaults to zero — every call blocks, no crash. Default-deny on missing config.

### TC-BILLING-AI-020 — Plan with explicitly zero AI included

A configured plan that includes zero AI mills.
**Expected:** Every call blocks. (Possible "no AI included" tier in the future.)

### TC-BILLING-AI-021 — Used amount overflow on pathological abuse

A user manages to record over $2M of usage in one period.
**Expected:** Storage handles the magnitude without overflow. Math involving allowance minus used does not underflow into nonsense.

### TC-BILLING-AI-022 — First-ever call from a fresh org races itself

Two AI calls hit a brand-new org simultaneously. Both try to lazily create the period rollup.
**Expected:** Exactly one rollup row exists at the end. Both calls succeed.

### TC-BILLING-AI-023 — Period boundary off by 1 second across services

Application clock vs database clock differ. App pre-flights "still in period X"; database inserts under period X+1.
**Expected:** Database time is authoritative. Don't trust client clocks.

### TC-BILLING-AI-024 — Seat count = 0 on a paid plan

A bug sets the subscription seat count to zero.
**Expected:** The system refuses. Paid subscriptions always have at least 1 seat.

### TC-BILLING-AI-025 — Org with a long history of usage rollups

2 years of monthly rollups per org × 1M orgs = 24M rows.
**Expected:** Reads remain fast (indexed by org and period). Cleanup policy deferred; document the projected growth so ops know when to add cold-storage.

---

## AI gate and usage recording

### TC-BILLING-AI-026 — Happy path

User has plenty of allowance. Pre-flight passes. Provider call succeeds. Usage is recorded. Allowance shrinks accordingly.

### TC-BILLING-AI-027 — Pre-flight passes, provider fails, no recording

Provider returns an error.
**Expected:** No usage record. Allowance unchanged. User sees the error. **No quota burned for a failed call.**

### TC-BILLING-AI-028 — Provider succeeds, but cost computation throws

Provider returned a malformed response that breaks our cost calculator.
**Expected:** Either record with cost=0 and flag for ops, or refuse to record and flag. **Don't crash and silently lose the usage.**

### TC-BILLING-AI-029 — Provider succeeds, but our recording fails

Network blip between the provider response and our database write.
**Expected:** A reconciliation job (daily) detects the orphan provider request and records it retroactively. Bounded loss until reconciliation = the per-call cost.

### TC-BILLING-AI-030 — Same provider request id submitted twice (network retry)

Provider's webhook delivers completion twice with the same id.
**Expected:** The second write detects the duplicate and does nothing. No double-charge.

### TC-BILLING-AI-031 — Provider request id collision across distinct calls (UB)

Hypothetical: the provider's id space collides between two genuinely different requests.
**Expected:** Documented as undefined behavior — the second request would be silently swallowed as a duplicate. In practice, all current providers use globally unique ids.

### TC-BILLING-AI-032 — User aborts a streaming call mid-stream

User clicks Cancel partway through a streaming text response.
**Expected:** The provider may still bill us for partial output. We record what we got. Cost reflects the partial response.
**Niche:** Verify the abort handler still records, e.g. from a finally block.

### TC-BILLING-AI-033 — Provider returns a 0-cost call

Some token models return cached prompts at deeply discounted rates; total comes out to 0.
**Expected:** Recorded with cost = 0. The system accepts 0 as a valid cost.

### TC-BILLING-AI-034 — Provider returns a negative cost (UB)

Bug in the cost calculator returns a negative number.
**Expected:** Refused at the storage layer. The faulty record is not persisted; ops is notified.

### TC-BILLING-AI-035 — BYOK billing bypass (contributor key set)

A contributor sets a `BYOK_*` key (e.g. `BYOK_OPENROUTER_API_KEY`). AI call goes through.
**Expected:** Calls route through the bare BYOK provider. The credit gate and Metronome metering are skipped entirely (no allowance impact) — the contributor's own key pays the provider. Auth is still enforced: an unauthenticated request, or a user with no resolvable org, is still rejected (BYOK bypasses billing only, never auth).

### TC-BILLING-AI-036 — BYOK key accidentally set on a hosted deploy

Bug: a `BYOK_*` secret leaks into a hosted/preview deploy.
**Expected:** There is **no code-level production guard** (by design — same server-env trust model as `OPENAI_API_KEY` / `REPLICATE_API_TOKEN`). With the key set, every org's calls bypass billing and the org-id sanity gate (auth still holds). This is a documented residual risk (see `SECURITY.md` GRIDA-SEC-003), mitigated operationally by never setting the secret in the hosted product — not by code. There is no "production check" to fail.

### TC-BILLING-AI-037 — Disabled model attempted

A model is marked disabled in the catalogue. App tries to call it.
**Expected:** The gate refuses with "model not available". Provider is not called.

### TC-BILLING-AI-038 — Model not in catalogue at all

App calls a model id we've never seen.
**Expected:** Refused. No fallback to a guessed cost. Default-deny on unknown.

### TC-BILLING-AI-039 — Model price changed mid-period

Ops updates a model's per-token rate mid-month.
**Expected:** Calls before the change retain the old rate in their forensic snapshot. Calls after use the new rate. Audit replay can recompute either accurately.
**Niche:** The pricing snapshot is captured at call time, not read back from the live catalogue.

### TC-BILLING-AI-040 — Cost-card audit detects drift

Weekly job compares recorded cost vs provider-reported cost per model. Drift > 5%.
**Expected:** Alert fires. Ops investigates. Audit reads the provider's reported cost as ground truth.

### TC-BILLING-AI-041 — Long-running predict-time call (5 minutes)

Replicate prediction takes 300s.
**Expected:** Cost is computed from the actual predict time and recorded once on completion.
**Niche:** Pre-flight at request time can't know the cost yet. Acceptable as long as the post-call recording is honest.

### TC-BILLING-AI-042 — Reasoning tokens (o1/o3-style models)

A call returns 5000 reasoning tokens.
**Expected:** The recorded cost includes the reasoning portion at its specific rate. The reasoning unit count is preserved for audit.

### TC-BILLING-AI-043 — Cached input tokens (prompt caching)

User repeats a long system prompt; provider reports 8000 cached input tokens.
**Expected:** Cached portion is charged at the cached-input rate (typically a discount). The snapshot captures which rate applied.

### TC-BILLING-AI-044 — Token-billed model returns no token counts

Provider edge: token-billed call response lacks the usage metadata.
**Expected:** Either fall back to a custom-strategy estimator or refuse and flag. **Don't insert with null counts and zero cost — that hides drift.**

### TC-BILLING-AI-045 — Provider says success but returns no output

Replicate prediction succeeded with empty output.
**Expected:** Treat as failure if output is required. Don't bill the user. Record audit trail for forensics.

### TC-BILLING-AI-046 — Caller has no user identity (system / cron)

A scheduled job runs AI on behalf of an org with no user attached.
**Expected:** Usage is recorded with no actor; forensics show "system." This is allowed.

### TC-BILLING-AI-047 — Gate latency under load

1000 concurrent gate calls.
**Expected:** p99 stays under 20ms. The hot path is one indexed read plus one write — no chained API calls, no per-call Stripe round-trip.

### TC-BILLING-AI-048 — User switches active org mid-call

User starts a call against org A; before completion they switch to org B in another tab.
**Expected:** The call is attributed to org A (org context captured at request time, not at completion).

### TC-BILLING-AI-049 — Streaming text call straddles a period rollover

User starts a streaming response in the middle of period rollover.
**Expected:** The call attributes to the period it started in (or completed in — pick one and document). The new period starts fresh.

### TC-BILLING-AI-050 — Provider invoice arrives, exceeds our recorded cost

The provider's monthly invoice shows we owe $1000. Our internal recorded total says $950.
**Expected:** Cost-card audit alerts on the $50 drift.
**Niche:** Canonical "we under-billed" detection.

### TC-BILLING-AI-051 — Provider invoice arrives, less than our recorded cost

Inverse: provider says $900, we recorded $950.
**Expected:** Audit alerts (we over-billed users). Ops investigates and may issue refunds.
**Niche:** Just as important — billing more than we paid breaks the at-cost promise.

### TC-BILLING-AI-052 — Custom-strategy model

A model whose pricing is too custom for the catalogue's standard strategies. App computes cost itself.
**Expected:** Catalogue check passes; cost comes from the application; the snapshot stores enough to audit the computation later.

### TC-BILLING-AI-053 — Future high-cost model (e.g. video generation)

Hypothetical $0.50 per call. Pro user has $0.06 remaining.
**Expected:** If the cost is known up front, pre-flight refuses. If only known after the call, the user goes a few cents over.
**Niche:** Bound: max single-call overrun = max known per-call cost. UI should estimate and refuse client-side too.

### TC-BILLING-AI-054 — Two providers happen to share a request id

Provider A returns id "abc123"; provider B independently returns id "abc123".
**Expected:** Treated as distinct events because the uniqueness key includes which provider it came from.

### TC-BILLING-AI-055 — Spoofed provider webhook

Attacker forges a provider callback claiming a free $0 successful call.
**Expected:** Provider webhooks are signature-verified before any meter update is triggered.
