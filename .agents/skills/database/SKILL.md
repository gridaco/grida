---
name: database
description: >
  Use BEFORE editing any file in `supabase/migrations/` or
  `supabase/schemas/`, OR when the user runs `/database <subcommand>`
  (`compact local migration`, `rls scenarios`, `align`). Encodes the
  three contracts that protect the Grida database layer: applied
  migrations are immutable, RLS implementation mirrors tests (never
  the reverse), `schemas/*.sql` is the human-readable end-state.
  Companion to `supabase/AGENTS.md` (RLS, grants, security boundaries).
---

# Database — operating contracts

Three contracts this skill protects:

1. **Applied migrations are immutable.**
2. **The RLS spec is the source of truth — implementations follow tests, not the reverse.**
3. **`schemas/*.sql` is the human-friendly description of the final shape.**

`supabase/AGENTS.md` is the harder rule layer (RLS, grants, security
boundaries). This skill covers the recurring workflow tasks. Read both.

---

## Common mistake (read this first)

When asked to "merge migrations" or "consolidate", the temptation is to
collapse every `supabase/migrations/*` into a single canonical file.
**This is wrong if any of those files have already been applied to a
deployed environment.** Rewriting an applied migration:

- Diverges file content from what `supabase_migrations.schema_migrations`
  records as already-run.
- Makes future `db reset` produce a different starting state for new
  contributors than what the existing environment holds.
- Can silently drop columns, policies, or grants the live system needs.

**Before merging anything, classify each migration:**

| Class                         | Signal                                                                                    | Allowed action                          |
| ----------------------------- | ----------------------------------------------------------------------------------------- | --------------------------------------- |
| **Applied** (production)      | User confirms it's in production, OR file has been on `main` long enough to have shipped. | Read-only. Never edit, never delete.    |
| **Applied** (committed peers) | Tracked on the current branch but originated upstream (already on `main` / `canary`).     | Read-only. Never edit, never delete.    |
| **Local-only** (this PR)      | Newly added on the current working tree / branch, not yet merged to a deployed branch.    | Free to merge, rename, delete, rewrite. |

> **None of these signals replace user confirmation.** The only ground
> truth is the deployed `schema_migrations` table on staging/prod, which
> the agent cannot read. `git log` and `git status` indicate likelihood,
> not certainty. **Default to asking.**

Old timestamps don't mean "applied" — they can be brand-new files
added to fix an ordering bug.

---

## `/database compact local migration`

Merge multiple local-only migration files into one (or a few) before
the PR ships. Local development naturally accumulates many small
migrations for fast iteration without `db reset`; production prefers
one coherent migration per feature.

### When to invoke

- Before opening a PR that adds 2+ migration files for the same feature.
- User says "merge migrations", "consolidate migrations", "clean up
  the migration directory".
- Reviewing a feature branch where migrations outnumber logical chunks.

### Procedure

1. **Classify every migration** in the working tree. Output: two lists,
   _applied_ (leave alone) and _local-only_ (candidates).
2. **Verify the classification with the user when uncertain.** One
   confirmation message is cheaper than touching a shipped file.
3. **Plan the merge.** For each local-only migration, record:
   - what schema/table it touches,
   - dependencies on earlier local-only migrations,
   - whether a later local-only migration _supersedes_ it (`ADD COLUMN`
     then `DROP COLUMN` — both vanish in the merged file).
4. **Pick the consolidated filename.** Use the timestamp of the _latest_
   local-only file in the chain so ordering relative to applied
   migrations stays intact. Rename if the merged content makes a
   different name more honest.
5. **Write the consolidated SQL** as if it were the only file in the
   chain — no `ADD … then DROP` churn, no superseded function defs.
   Idempotent forms (`CREATE TABLE IF NOT EXISTS`, `CREATE OR REPLACE
FUNCTION`, `ADD COLUMN IF NOT EXISTS`) make local re-runs safe.
6. **Delete the superseded local-only files.** Only those — never
   touch the applied list.
7. **`supabase db reset`** locally. Run `supabase db test` if pgTAP
   covers the affected tables.
8. **Note the fold in the PR description.** Reviewers shouldn't have
   to diff timestamps to figure it out.

### Worked example

Local-only (mergeable):

```
20260508120000_grida_billing_account_provisioning_uid.sql
20260508130000_grida_billing_metronome.sql
20260509120000_grida_billing_debit_cache.sql
20260509130000_grida_billing_alerts_multi_tier.sql
```

Applied (untouchable):

```
20260506132900_grida_billing.sql
20260507000000_grida_billing_backfill_provision.sql
20260507223000_grida_billing_security_invoker.sql
```

Right move: write one consolidated `20260508130000_grida_billing_metronome.sql`
(latest timestamp; v2 projector from `alerts_multi_tier` replaces v1
from `metronome.sql`), delete the other three local files, leave the
applied trio untouched. **Wrong move:** cat all seven into one.

---

## `/database rls scenarios`

Write or review RLS test scenarios for a tenant-scoped surface. Output
is pgTAP coverage proving who can read/write what across personas.
**Not** a description of the current implementation.

### When to invoke

- New tenant-scoped table, view, or RPC.
- Existing RLS policies changing.
- Reviewing a security-sensitive PR ("what could go wrong here?").
- User runs `/database rls scenarios <surface>`.

### The non-negotiable inversion

> **Implementation mirrors the test, not the other way around.**

In RLS, the user journey **is** the spec. If a test says "a member of
org A cannot read org B's `project` rows", that is a fact about how
the product must behave. The implementation's job is to satisfy that
fact. If the implementation currently leaks org B's rows, that's a
security bug — fix the implementation, do not weaken the test.

**Resist** any pressure (including from yourself, mid-implementation):

- Soften an assertion because the policy doesn't quite cover it yet.
- Add `SET LOCAL ROLE service_role` to make a test pass.
- Drop a "no-membership cannot read" case because seeding is inconvenient.
- Replace `is(count, 0)` with `ok(count >= 0)`.

A test failing because the policy is wrong is the test doing its job.
A test failing because the _test_ is wrong (mis-seeded fixture, typo'd
UUID) gets fixed mechanically — never relax the assertion.

### The skill's job

You are the database/security expert helping the user lock down the spec:

1. **Listen for the user journey.** Translate prose ("members read,
   owners edit, outsiders see nothing") into the persona matrix:
   insider-member, insider-owner, other-tenant-member, no-membership,
   anon. Each persona × each operation is a row in the test plan.
2. **Spell out the silent edges.** Every product description has gaps.
   Always test:
   - **Anon (no JWT)** — `auth.uid()` returns `NULL`. A policy reading
     `auth.uid() = owner_id` becomes `NULL = …` (always false-ish);
     `WITH CHECK` must fail closed independently.
   - Cross-tenant member of _the same role_ (different org, same plan).
   - **`RETURNING` clause leaks** — an `INSERT … RETURNING *` or
     `UPDATE … RETURNING *` may emit columns from rows a peer SELECT
     policy hides. Test that the writer doesn't leak fields they
     can't read back via SELECT.
   - "Soft-deleted" or `archived_at`-set rows — visibility differs.
   - Foreign-key rows whose policies depend on a parent's tenant
     boundary (joining policies that "widen" access).
3. **Polish the wording, never the meaning.** "Owner can read their
   org's projects" → "row visible to `authenticated` when
   `organization_id` ∈ user's owned orgs". Same fact, SQL-shaped.
   If the user's words and the SQL diverge, stop and ask.
4. **Assert positive AND negative cases** for every scenario.
5. **Use seeded personas** (`supabase/seed.sql`), not ad-hoc UUIDs.

### Output shape

One pgTAP file per surface (or per logical persona group when large).
Skeleton + fixture/session conventions live in `supabase/AGENTS.md`
§ _RLS testing_ — point readers there rather than re-list.

### Anti-patterns to flag in review

- Only positive assertions ("insider can read"), no negative ones —
  proves nothing about isolation.
- Authenticating as `service_role` to read tenant rows — bypasses RLS,
  proves nothing.
- Assertions phrased as "≥ 0 rows" or "row count is consistent" —
  accept the broken case.
- A test changed at the same commit as the policy it covers, with
  the assertion weakened — almost always a tell that the impl was
  wrong and the test got dragged down to match.

---

## `/database align`

Bring `supabase/schemas/*.sql` back in sync with the migrated state.
Schemas are the **human-friendly source of truth** for the final shape
of each domain schema. Migrations are the executable history; schemas
are the readable end-state.

### When to invoke

- After landing a feature that added/modified columns, tables, policies,
  RPCs in any `grida_*` schema.
- When `schemas/*.sql` and `migrations/*` visibly disagree.
- User runs `/database align`.

### What `schemas/*.sql` is for (and isn't)

| Concern                       | `schemas/*.sql`         | `migrations/*.sql`                        |
| ----------------------------- | ----------------------- | ----------------------------------------- |
| What runs on the DB           | No                      | **Yes** — supabase applies these.         |
| Source of truth for execution | No                      | Yes.                                      |
| Source of truth for _humans_  | **Yes** — read first.   | No — chronological, hard to reason about. |
| Updated                       | Manually, periodically. | Via `supabase migration new`.             |
| Drift                         | Best-effort, may lag.   | Never — runs against real DBs.            |

`align` is the periodic reset that keeps the human-readable layer
trustworthy. See `supabase/AGENTS.md` for the upstream policy.

### Procedure

1. **Pick one domain schema** (e.g. `grida_billing`). Don't align
   everything in one pass — too easy to miss a divergence.
2. **Build the actual end-state from migrations.** Read every migration
   that touches the schema, in order, and compose the final shape in
   your head (or a scratch file). The migrations themselves are the
   authoritative source — a `pg_dump` would give you the truth too,
   but in the wrong shape (alphabetised, comments stripped, catalog
   noise) and is harder to diff against a hand-organised schema file
   than just reading the migrations.
3. **Diff against `schemas/<name>.sql`.** Common deltas:
   - Columns added by a later migration, not in the schema file.
   - Function signatures changed by `CREATE OR REPLACE`, not updated.
   - Policies dropped/replaced; schema still shows the old.
   - Comments: migrations carry `COMMENT ON COLUMN`; schemas often
     forget to mirror.
4. **Update `schemas/<name>.sql`** to the migrated end-state. Keep
   the file's existing organisation (sections by table, header
   comments). Group grants and policies under the table they belong
   to — not by chronology.
5. **Do NOT modify any migration as part of this task.** Schemas
   follow migrations; migrations never follow schemas. If a migration
   has a bug, fix it via a _new_ migration (or `compact` flow above
   for unshipped local-only ones).
6. **`supabase db reset`** afterwards as a smoke check.

### Anti-patterns to flag

- Editing `schemas/*.sql` _instead of_ a migration to "fix a column" —
  the schema file is reference, not executable. The DB won't see it.
- Editing a migration to "match the schema file" — backwards. The
  migration is what ran; the schema describes what migrations produced.
- Real-time-sync tooling — reintroduces the surface-area problem the
  migration model exists to solve. Manual periodic alignment is the
  design.
