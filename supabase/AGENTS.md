# Supabase `AGENTS.md`

This file is **for LLM agents** working in `./supabase`. It provides project-specific context, security constraints, and conventions.

If you’re a human contributor, start with `supabase/README.md`.

---

## Scope and goal

You are editing the **database security boundary**. Your goal is to make changes that are:

- **Correct** (matches product intent)
- **Safe-by-default** (deny-by-default, tenant isolated)
- **Provable** (pgTAP tests demonstrate isolation and access)

If you can’t prove it with tests and by reading the SQL, treat it as a security bug.

---

## Security posture (treat the database as hostile-by-default)

Supabase makes it easy to expose Postgres via PostgREST. **Assume tables are reachable unless you explicitly prevent it.**

**Non-negotiables**

- **RLS is mandatory** for any table/view that contains tenant/user data, and for anything reachable from the API surface.
- **Policies must be enforced by tests**. For every RLS-protected surface, add **pgTAP coverage** under `supabase/tests/`.
- **No “it should be fine”**: if you can’t prove it with a test (and by reading the SQL), treat it as a security bug.

**RLS rules of thumb**

- **Enable RLS explicitly** and prefer forcing it:
  - `ALTER TABLE ... ENABLE ROW LEVEL SECURITY;`
  - `ALTER TABLE ... FORCE ROW LEVEL SECURITY;` (when appropriate; be mindful of privileged roles and internal maintenance)
- **Deny-by-default**: start with no permissive policies; add the minimum policies required for product behavior.
- **No cross-tenant access**: every policy should be scoped by tenant boundary (org/project) and verified in tests using seeded “other tenant” users.
- **Be explicit about API roles**:
  - `anon` and `authenticated` are untrusted.
  - `service_role` bypasses RLS: only use it for controlled setup/maintenance (and in tests for fixture creation).

**Views, functions, and `SECURITY DEFINER`**

- Treat **views as part of the API surface**: they must not leak rows or columns across tenants.
- Avoid `SECURITY DEFINER` unless there is a clear, reviewed reason.
  - If you must use it: lock down privileges, set a safe `search_path`, validate inputs, and write tests demonstrating it can’t be abused for escalation.
- Avoid dynamic SQL in privileged contexts unless absolutely necessary and carefully hardened.

---

## “Reachable surface” mental model (what can leak)

Assume any of the below can become internet-reachable over time:

- **Tables / views in `public`** (via PostgREST)
- **RPC functions** (`/rpc/<fn>`) when `EXECUTE` is granted
- **Foreign keys + joins** that power policies (policy joins can accidentally “widen” access)

So you must manage **three layers**:

- **RLS**: row visibility + row write permissions
- **Grants**: what roles can `SELECT/INSERT/UPDATE/DELETE` or `EXECUTE`
- **Tests**: proofs that insider/outsider/other-tenant behave as intended

---

## Schema conventions (API surface vs internal organization)

This codebase currently contains **multiple schema conventions** and is not perfectly aligned. Going forward, our **best-effort standard** is:

- **`public` is the API surface**.
  - For Supabase/PostgREST and any “public API” access, we aim to expose only what is intentionally supported under `public`.
  - Prefer exposing **views** (and, when necessary, **RPC functions**) in `public` as the stable interface.
- **Non-`public` schemas are for internal organization**.
  - Use domain schemas (e.g. `grida_*`) to organize and isolate underlying tables, especially when it improves maintainability and security review.
  - These schemas should be treated as **implementation detail**, not a contract.
- **Wrap, don’t leak**.
  - If underlying tables live outside `public`, expose the relevant, permissioned subset via `public.<view>` (or a carefully audited `public` RPC) rather than granting direct access to non-`public` relations.
  - Keep wrappers tenant-safe (RLS-safe, no widening joins) and backed by pgTAP tests.
- **Be explicit and defensive**.
  - Minimize grants; avoid accidental exposure via default privileges.
  - For any `SECURITY DEFINER` in `public`, set a safe `search_path`, fully qualify referenced relations, validate tenant boundary inside the function, and prove behavior with tests.

---

## RLS policy patterns (recommended)

- **Always write both sides**:
  - `USING (...)` for read/delete visibility
  - `WITH CHECK (...)` for insert/update validity
- **Prefer “membership join” checks** over trusting client-supplied IDs:
  - Good: “caller must be a member of org owning this row”
  - Bad: “row.org_id = <input org_id>” without membership verification
- **Index what policies depend on**:
  - If your policy filters by `project_id`, `org_id`, `owner_id`, membership join keys, etc., add indexes to avoid slow RLS scans.

### Common foot-guns (avoid)

- **Permissive policies for `anon`** unless explicitly required and tested.
- **Policy predicates that don’t include tenant boundary** (easy to leak cross-tenant).
- **Views that bypass RLS** (e.g. selecting from tables without RLS or using privileged functions).
- **`SECURITY DEFINER` functions that read tenant tables without enforcing tenant checks internally**.

---

## RLS testing (pgTAP is required)

We use **pgTAP** to assert RLS behavior at the database level.

- **Tests live in** `supabase/tests/*.sql`.
- Create new tests with `supabase test new <name>` (local only).
- Run tests with `supabase db test` (local only).

**How tests should be written**

- Use **seed personas** (see “Seed data” below) to prove:
  - **insider** can access their tenant’s data
  - **other tenant** cannot access insider’s tenant
  - **no membership** cannot access tenant-scoped data
- In tests, it’s acceptable to:
  - `SET LOCAL ROLE service_role` for fixture setup
  - Then switch to `authenticated` and set `request.jwt.claim.sub` to simulate a user session
- Always include:
  - A plan (`SELECT plan(n);`)
  - Positive and negative assertions (`ok(...)`, `is(...)`, `throws_ok(...)`, etc.)

**Coverage expectation**

- Any change that alters RLS, permissions, or tenant boundaries must ship with tests.
- New tables that hold tenant/user data must include at least:
  - read isolation tests
  - write isolation tests (insert/update/delete)

### pgTAP skeleton (copy/paste)

Use this as a starting point for new security-sensitive changes:

```sql
BEGIN;
SELECT plan(9);

-- Fixture creation (bypass RLS)
SET LOCAL ROLE service_role;
-- ... insert orgs/projects/users/memberships/rows ...

-- Insider session
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '<seed_user_uuid>', true);

-- Positive assertions
SELECT ok(exists(select 1 from public.some_table where id = '<expected_row_uuid>'), 'insider can read own tenant row');

-- Other-tenant session
SELECT set_config('request.jwt.claim.sub', '<other_tenant_user_uuid>', true);
SELECT ok(
  not exists(select 1 from public.some_table where id = '<expected_row_uuid>'),
  'other tenant cannot read insider row'
);

-- No-membership session
SELECT set_config('request.jwt.claim.sub', '<no_membership_user_uuid>', true);
SELECT ok(
  not exists(select 1 from public.some_table where id = '<expected_row_uuid>'),
  'no membership cannot read tenant row'
);

SELECT * FROM finish();
ROLLBACK;
```

---

## Seed data (multi-tenant by design)

We seed local databases for:

- fast local development (realistic data)
- repeatable security testing (multi-tenant isolation)

**Seed sources**

- `supabase/seed.sql`: executable seed (LOCAL ONLY)
- `supabase/seed.md`: describes the seeded personas and scenarios

**Seed expectations**

- Seed should be **idempotent or reset-friendly** (it runs as part of local resets).
- Seed must include **multiple tenants** (orgs/projects) and **multiple users** to make RLS failures obvious.
- Never add production secrets or production identifiers to seed content.

---

## Migrations (source of truth)

**Source of truth is** `supabase/migrations/*`.

- Create migrations via `supabase migration new <name>`.
- Keep migrations:
  - small and reviewable
  - forward-only (avoid rewriting already-applied migrations)
  - explicit about RLS/policies/grants (don’t rely on defaults)

**When adding or changing schema**

- Add the table/type/function change in a migration.
- Add/adjust RLS policies in the same migration (or an immediately adjacent one).
- Add pgTAP tests proving the intended access model.
- Consider indexes and FK performance (especially for policy predicates and joins).

### Migration order-of-operations (recommended)

For a new tenant-scoped table, prefer this order:

- Create table + constraints (FKs, not null, etc.)
- Add indexes needed for:
  - FKs
  - policy predicates / membership joins
- Enable (and often force) RLS
- Add the minimum policies for product behavior
- Lock down grants (explicitly grant only what you need)
- Add/adjust pgTAP tests

---

## RPC / functions (especially `SECURITY DEFINER`)

Prefer **plain RLS + normal DML**. Use RPC only when you need:

- a multi-statement transaction with complex invariants
- performance that would be hard to achieve through PostgREST
- carefully audited “capability” operations (e.g. safe cascade deletion)

### If you must use `SECURITY DEFINER`

Non-negotiables for privileged RPC:

- **Set a safe `search_path`**
- **Fully qualify** tables/functions where reasonable (`public.my_table`)
- **Validate inputs** (types, existence, tenant boundary)
- **Lock down privileges** (`REVOKE ALL ... FROM PUBLIC;` then grant to the minimum role)
- **Test escalation resistance** (outsider cannot delete/read/modify cross-tenant)

Template:

```sql
CREATE OR REPLACE FUNCTION public.my_rpc(arg_project_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  -- enforce tenant boundary explicitly inside the function
  -- ... do work ...
END;
$$;

REVOKE ALL ON FUNCTION public.my_rpc(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.my_rpc(uuid) TO authenticated;
```

---

## `schemas/` (human reference, may drift)

`supabase/schemas/*` is a **for-humans reference** to keep business tables aligned with the database.

Important caveat:

- It is **not guaranteed to be fully synced** with the real database state.
- Treat it as **best-effort documentation** (it may contain mistakes).
- Prefer reading migrations for ground truth, but **try to keep `schemas/` updated** when you make changes so it remains useful.

See `supabase/schemas/README.md`.

---

## Running and testing (agent safety rules)

Agents are allowed to run **local-only** Supabase commands.

**Allowed (local)**

- `supabase start` / `supabase stop` / `supabase status`
- `supabase db reset`
- `supabase migration new ...`
- `supabase migration up`
- `supabase test new ...`
- `supabase db test`
- `supabase gen types typescript --local ...`

**Forbidden without explicit user permission**

- Anything that can target a remote project, especially:
  - `supabase link ...`
  - `supabase db push`
  - any command that requires `SUPABASE_ACCESS_TOKEN`
- Any destructive command when a project might be linked (treat as remote-risk).

**When uncertain**

- Stop and ask for explicit permission before running a command that might affect a remote environment.

---

## Review checklist (before you consider the work “done”)

- **RLS**: enabled (and forced when appropriate) for tenant/user data tables.
- **Policies**: minimal, tenant-scoped, and readable.
- **Grants**: no accidental `PUBLIC` access; only required roles have access.
- **RPC**: privileged functions have safe `search_path`, locked-down `EXECUTE`, and tenant checks inside.
- **Tests**: pgTAP added/updated to prove tenant isolation and intended access.
- **Seed**: still supports multi-tenant scenarios and hasn’t become brittle.
- **Privileged code**: no unnecessary `SECURITY DEFINER`, safe `search_path` where used.
- **Docs**: `schemas/` updated where reasonable; avoid contradicting migrations.
