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
  - For any `SECURITY DEFINER` in `public`, set a safe `search_path`, fully qualify referenced relations, and prove its [RPC role contract](#rpc-role-contract). User-callable functions must validate the tenant boundary inside the function.

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
- **User-callable `SECURITY DEFINER` functions that read tenant tables without enforcing tenant checks internally**.

---

## RLS testing (pgTAP is required)

We use **pgTAP** to assert RLS behavior at the database level.

- **Tests live in** `supabase/tests/*.sql`.
- Create new tests with `supabase test new <name>` (local only).
- Run tests with `supabase test db` (local only).

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

### RPC role contract

Declare the intended callers for every function signature, including overloads:

- **Service-only:** grant `EXECUTE` only to the intended trusted role, normally
  `service_role`. A privileged wrapper must deny `anon` and `authenticated`
  even when its internal tables/functions are private or protected by RLS.
- **User-callable tenant operations:** prefer `SECURITY INVOKER`. If `SECURITY DEFINER` is necessary,
  require an authenticated caller and enforce the tenant boundary inside the
  function. Bind user-scoped lookups to `auth.uid()`; reject a supplied foreign
  user ID. Grant only the intended API roles.

Every definer function needs a safe `search_path`, fully qualified relation and
function references, and input validation appropriate to that contract.

PostgreSQL grants function `EXECUTE` to `PUBLIC` by default. This repository also
has defaults granting `public` functions created by `postgres` directly to `anon`
and `authenticated`. Revoking from `PUBLIC` leaves those direct grants intact;
grants inherited through other roles also count. `GRANT ... TO service_role`
does not make access exclusive.

Create/replace the function and set privileges for its exact signature in the
same transaction, so no permissive intermediate state is committed. Service-only
template:

```sql
BEGIN;

CREATE OR REPLACE FUNCTION public.my_rpc(arg_project_id bigint)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  -- Validate inputs and perform the privileged operation.
END;
$$;

REVOKE ALL ON FUNCTION public.my_rpc(bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.my_rpc(bigint) TO service_role;

COMMIT;
```

For a user-callable RPC, use the same explicit revoke, implement the caller/tenant
guard, then grant the intended roles. Inspect existing ACLs and role memberships
for additional grants; `CREATE OR REPLACE FUNCTION` preserves existing ACLs.

**Default privileges are not a substitute for function ACLs.** They apply only to
future objects created by the specified creator role. Schema-scoped
`ALTER DEFAULT PRIVILEGES ... REVOKE` cannot cancel a global default grant,
including PostgreSQL's built-in `PUBLIC EXECUTE` on functions. Verify a default
change by creating a test function as the actual migration role and checking its
ACLs, then roll back. Do not change global defaults or revoke unrelated `public`
functions as a shortcut for a scoped permission fix.

**Required pgTAP proof:**

- Replay the complete migration history and seed locally (`supabase db reset`),
  then run `supabase test db`. A function tested in an empty scratch schema may
  miss inherited defaults and grants.
- Check `has_function_privilege(role, 'public.my_rpc(bigint)', 'EXECUTE')` for
  `anon`, `authenticated`, and `service_role`, against the declared contract.
  This checks effective access, including inherited grants. Separately assert
  no unintended `PUBLIC EXECUTE` ACL: inspect
  `aclexplode(coalesce(proacl, acldefault('f', proowner)))` in `pg_proc`, where
  `grantee = 0` denotes PUBLIC. A NULL `proacl` means the built-in default
  function ACL, not an empty ACL.
- Make real calls after `SET LOCAL ROLE`, with appropriate JWT claims. Prove
  permission denial (`42501`) for untrusted callers and a successful call as
  `service_role` for service-only RPCs; a call as `postgres` does not prove that
  path. Use valid fixtures/arguments so validation errors cannot stand in for
  permission denial.
  For user-callable RPCs, cover own-tenant success, other tenant, no membership,
  anon, and supplied foreign user IDs where applicable. Table/view denial alone
  does not prove an RPC is denied.
- Discover the complete RPC family and overloads from the catalog and assert
  the expected signatures as well as their privileges. A new function or
  overload must trigger coverage rather than silently escape a fixed test list.

When reviewing history, reconstruct access from role memberships, ownership,
grants/defaults, wrapper bodies, policies, and role-based tests at the relevant
revisions. Comments and grant intent are not evidence of effective access.

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
- `supabase test db`
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
- **Grants**: no unintended effective access through `PUBLIC`, direct grants, or role membership.
- **RPC**: every signature satisfies the [RPC role contract](#rpc-role-contract), including caller/tenant guards for user-callable definer functions.
- **Tests**: pgTAP added/updated to prove tenant isolation and intended access.
- **Seed**: still supports multi-tenant scenarios and hasn’t become brittle.
- **Privileged code**: no unnecessary `SECURITY DEFINER`, safe `search_path` where used.
- **Docs**: `schemas/` updated where reasonable; avoid contradicting migrations.
