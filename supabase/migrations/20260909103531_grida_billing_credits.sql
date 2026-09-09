-- GRIDA-EE: billing — passive cached-credit reads.
-- GRIDA-SEC-010 / GRIDA-SEC-012 — caller membership, no privileged read or provider IDs.
BEGIN;

CREATE VIEW public.v_billing_credits
WITH (security_invoker = true)
AS
SELECT
  o.id AS organization_id,
  o.name AS organization_name,
  o.display_name AS organization_display_name,
  a.organization_id IS NOT NULL AS account_present,
  coalesce(a.metronome_customer_id <> '', false) AS credits_provisioned,
  a.cached_balance_cents,
  a.cached_balance_at,
  a.customer_entitled
FROM public.organization o
LEFT JOIN grida_billing.account a ON a.organization_id = o.id
WHERE EXISTS (
  SELECT 1 FROM public.organization_member om
  WHERE om.organization_id = o.id
    AND om.user_id = (SELECT auth.uid())
);

-- The direct membership predicate shares this statement's snapshot. Existing
-- organization and billing-account RLS still apply as the invoking caller.
-- The left join preserves visible organizations whose billing account is absent.
REVOKE ALL ON public.v_billing_credits FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.v_billing_credits TO authenticated, service_role;

COMMENT ON VIEW public.v_billing_credits IS
  'Member-scoped passive credit cache. No provider identifiers or subscription data. '
  'Missing billing accounts remain explicit; cache timestamps include optimistic debits. '
  'Customer linkage follows the existing gate and is not live provider verification.';

COMMIT;
