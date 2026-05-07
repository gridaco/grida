-- Convert grida_billing's API surface to the canonical Supabase pattern:
-- security_invoker = true views over RLS-protected base tables, instead
-- of SECURITY DEFINER views over a fully-locked schema. Functionally
-- equivalent for the API contract; satisfies splinter lint 0010
-- (security_definer_view) and aligns with the rest of the codebase.
--
-- Key shifts:
--   1. authenticated gets USAGE on grida_billing (needed because
--      security_invoker views resolve `grida_billing.*` as the caller).
--   2. account / subscription / audit lose their "deny everything"
--      RESTRICTIVE policies. They get SELECT-only PERMISSIVE policies
--      that mirror what the views' WHERE clauses used to enforce. Writes
--      stay service-role only (no INSERT/UPDATE/DELETE grant).
--   3. product_catalogue / stripe_event remain fully locked — no API
--      consumer reads them.
--   4. Both public.v_billing_* views flip to security_invoker = true and
--      drop their auth-side WHERE clauses (RLS now does the row scoping).
--      Their grants are scrubbed of Supabase's default-ALL on `public`
--      so anon doesn't see them in the GraphQL schema.
--
-- All operations are idempotent.

BEGIN;

-- ─── 1. Schema USAGE ──────────────────────────────────────────────
REVOKE ALL ON SCHEMA grida_billing FROM PUBLIC;
GRANT  USAGE ON SCHEMA grida_billing TO authenticated, service_role;


-- ─── 2a. account ─────────────────────────────────────────────────
DROP POLICY IF EXISTS default_deny_authenticated ON grida_billing.account;
DROP POLICY IF EXISTS default_deny_anon          ON grida_billing.account;
DROP POLICY IF EXISTS member_can_select          ON grida_billing.account;

GRANT SELECT ON TABLE grida_billing.account TO authenticated;
CREATE POLICY member_can_select ON grida_billing.account
  FOR SELECT TO authenticated
  USING (
    organization_id IN (
      SELECT om.organization_id FROM public.organization_member om
       WHERE om.user_id = (SELECT auth.uid())
    )
  );


-- ─── 2b. subscription ────────────────────────────────────────────
DROP POLICY IF EXISTS default_deny_authenticated ON grida_billing.subscription;
DROP POLICY IF EXISTS default_deny_anon          ON grida_billing.subscription;
DROP POLICY IF EXISTS member_can_select          ON grida_billing.subscription;

GRANT SELECT ON TABLE grida_billing.subscription TO authenticated;
CREATE POLICY member_can_select ON grida_billing.subscription
  FOR SELECT TO authenticated
  USING (
    organization_id IN (
      SELECT om.organization_id FROM public.organization_member om
       WHERE om.user_id = (SELECT auth.uid())
    )
  );


-- ─── 2c. audit (owner-only) ──────────────────────────────────────
DROP POLICY IF EXISTS default_deny_authenticated ON grida_billing.audit;
DROP POLICY IF EXISTS default_deny_anon          ON grida_billing.audit;
DROP POLICY IF EXISTS owner_can_select           ON grida_billing.audit;

GRANT SELECT ON TABLE grida_billing.audit TO authenticated;
CREATE POLICY owner_can_select ON grida_billing.audit
  FOR SELECT TO authenticated
  USING (
    organization_id IN (
      SELECT o.id FROM public.organization o
       WHERE o.owner_id = (SELECT auth.uid())
    )
  );


-- ─── 3. product_catalogue and stripe_event stay locked ──────────
-- (no changes — no API consumer; service_role-only access).


-- ─── 4a. v_billing_subscription ─────────────────────────────────
CREATE OR REPLACE VIEW public.v_billing_subscription
WITH (security_invoker = true)
AS
SELECT
  s.organization_id,
  s.plan,
  s.is_free,
  s.status,
  s.quantity,
  s.cancel_at_period_end,
  s.current_period_start,
  s.current_period_end,
  s.stripe_subscription_id,
  acc.stripe_customer_id
FROM grida_billing.subscription s
LEFT JOIN grida_billing.account acc ON acc.organization_id = s.organization_id
WHERE s.status <> 'canceled';
-- Row scoping is enforced by `member_can_select` on the underlying tables.

REVOKE ALL    ON public.v_billing_subscription FROM PUBLIC, anon, authenticated;
GRANT  SELECT ON public.v_billing_subscription TO   authenticated, service_role;


-- ─── 4b. v_billing_audit ────────────────────────────────────────
CREATE OR REPLACE VIEW public.v_billing_audit
WITH (security_invoker = true)
AS
SELECT
  a.id,
  a.organization_id,
  a.user_id,
  a.operation,
  a.stripe_event_id,
  a.stripe_subscription_id,
  a.stripe_invoice_id,
  a.stripe_customer_id,
  a.member_user_id,
  a.prev_quantity,
  a.new_quantity,
  a.plan,
  a.status,
  a.event_type,
  a.billing_reason,
  a.attempt_count,
  a.amount_cents,
  a.note,
  a.created_at
FROM grida_billing.audit a;
-- Owner-only filter is enforced by `owner_can_select` on grida_billing.audit.

REVOKE ALL    ON public.v_billing_audit FROM PUBLIC, anon, authenticated;
GRANT  SELECT ON public.v_billing_audit TO   authenticated, service_role;

COMMIT;
