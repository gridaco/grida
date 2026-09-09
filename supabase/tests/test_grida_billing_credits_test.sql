-- GRIDA-EE: billing — cached-credit read contract.
-- GRIDA-SEC-010 / GRIDA-SEC-012 — membership isolation and SELECT-only public projection.
BEGIN;
SELECT plan(31);

-- Seed identities and organization IDs are local to each reset.
DO $$ BEGIN
  PERFORM set_config('credits.insider', (SELECT id::text FROM auth.users WHERE email = 'insider@grida.co'), true);
  PERFORM set_config('credits.alice', (SELECT id::text FROM auth.users WHERE email = 'alice@acme.com'), true);
  PERFORM set_config('credits.random', (SELECT id::text FROM auth.users WHERE email = 'random@example.com'), true);
  PERFORM set_config('credits.local', (SELECT id::text FROM public.organization WHERE name = 'local'), true);
  PERFORM set_config('credits.acme', (SELECT id::text FROM public.organization WHERE name = 'acme'), true);
END $$;

-- 1–6: narrow public surface and explicit grants.
SELECT has_view('public', 'v_billing_credits', 'credits public view exists');
SELECT ok(
  (SELECT 'security_invoker=true' = ANY(reloptions) FROM pg_class WHERE oid = 'public.v_billing_credits'::regclass),
  'view executes with caller authority'
);
SELECT columns_are('public', 'v_billing_credits', ARRAY[
  'organization_id', 'organization_name', 'organization_display_name',
  'account_present', 'credits_provisioned', 'cached_balance_cents',
  'cached_balance_at', 'customer_entitled'
], 'view exposes only organization and safe credit-cache fields');
SELECT ok(has_table_privilege('authenticated', 'public.v_billing_credits', 'SELECT'), 'authenticated can SELECT the view');
SELECT ok(has_table_privilege('service_role', 'public.v_billing_credits', 'SELECT'), 'service role has SELECT only for fixture inspection');
SELECT ok(NOT has_table_privilege('anon', 'public.v_billing_credits', 'SELECT'), 'anon has no SELECT grant');

-- 7–12: grants never make this a writable billing surface, even for fixture authority.
SELECT ok(NOT has_table_privilege(role_name, 'public.v_billing_credits', operation), role_name || ' cannot ' || operation || ' credits view')
FROM (VALUES ('authenticated'), ('service_role')) AS roles(role_name)
CROSS JOIN (VALUES ('INSERT'), ('UPDATE'), ('DELETE')) AS operations(operation);

-- 13–16: actual denied access and mutations, including RETURNING.
SET LOCAL ROLE anon;
SELECT throws_ok('SELECT * FROM public.v_billing_credits', '42501', NULL, 'anonymous reads are denied');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', current_setting('credits.insider'), true);
SELECT throws_ok('INSERT INTO public.v_billing_credits (organization_id) VALUES (1) RETURNING *', NULL, NULL, 'member cannot insert through the view');
SELECT throws_ok('UPDATE public.v_billing_credits SET cached_balance_cents = 100000 RETURNING *', NULL, NULL, 'member cannot update through the view');
SELECT throws_ok('DELETE FROM public.v_billing_credits RETURNING *', NULL, NULL, 'member cannot delete through the view');

-- 17–22: own, other-tenant, no-membership and anonymous-identity reads.
SELECT is((SELECT count(*) FROM public.v_billing_credits WHERE organization_id = current_setting('credits.local')::bigint), 1::bigint, 'insider sees exactly one own organization row');
SELECT is((SELECT count(*) FROM public.v_billing_credits WHERE organization_id = current_setting('credits.acme')::bigint), 0::bigint, 'insider cannot see Alice credits');
SELECT is(
  (SELECT jsonb_build_array(account_present, credits_provisioned, cached_balance_cents, cached_balance_at, customer_entitled)
   FROM public.v_billing_credits WHERE organization_id = current_setting('credits.local')::bigint),
  '[true,false,0,null,false]'::jsonb,
  'seed account is explicitly unlinked with an unobserved raw default cache'
);
SELECT set_config('request.jwt.claim.sub', current_setting('credits.alice'), true);
SELECT is((SELECT count(*) FROM public.v_billing_credits WHERE organization_id = current_setting('credits.acme')::bigint), 1::bigint, 'Alice sees her own organization');
SELECT set_config('request.jwt.claim.sub', current_setting('credits.random'), true);
SELECT is((SELECT count(*) FROM public.v_billing_credits), 0::bigint, 'user with no memberships sees no credits');
SELECT set_config('request.jwt.claim.sub', '', true);
SELECT is((SELECT count(*) FROM public.v_billing_credits), 0::bigint, 'authenticated role with no user identity sees no credits');

-- Fixture writes use existing local-only setup authority, never the public view.
RESET ROLE;
SET LOCAL ROLE service_role;
DO $$ BEGIN
  PERFORM public.fn_billing_set_metronome_ids(current_setting('credits.local')::bigint, 'credits_pgtap_customer', 'credits_pgtap_contract');
  PERFORM public.fn_billing_set_balance_cache(current_setting('credits.local')::bigint, 0, false);
END $$;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', current_setting('credits.insider'), true);

-- 23–24: a genuine observed zero is distinct from an unobserved default.
SELECT is((SELECT cached_balance_cents FROM public.v_billing_credits WHERE organization_id = current_setting('credits.local')::bigint), 0::bigint, 'observed zero remains zero');
SELECT ok((SELECT credits_provisioned AND cached_balance_at IS NOT NULL AND NOT customer_entitled FROM public.v_billing_credits WHERE organization_id = current_setting('credits.local')::bigint), 'linked observed zero retains its timestamp and gate flag');

RESET ROLE;
SET LOCAL ROLE service_role;
DO $$ BEGIN PERFORM public.fn_billing_set_balance_cache(current_setting('credits.local')::bigint, -123, false); END $$;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', current_setting('credits.insider'), true);
-- 25: negative estimates are not silently clamped.
SELECT is((SELECT cached_balance_cents FROM public.v_billing_credits WHERE organization_id = current_setting('credits.local')::bigint), (-123)::bigint, 'negative stored estimate remains visible');

RESET ROLE;
SET LOCAL ROLE service_role;
-- Corrupt/unobserved cache states are fixture-only and rolled back at the end.
UPDATE grida_billing.account SET cached_balance_cents = 25, cached_balance_at = NULL, customer_entitled = true
WHERE organization_id = current_setting('credits.local')::bigint;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', current_setting('credits.insider'), true);
-- 26: retain raw gate data even when display has no cache observation.
SELECT is((SELECT jsonb_build_array(credits_provisioned, cached_balance_cents, cached_balance_at, customer_entitled) FROM public.v_billing_credits WHERE organization_id = current_setting('credits.local')::bigint), '[true,25,null,true]'::jsonb, 'linked account without timestamp remains an explicit unobserved cache');

RESET ROLE;
SET LOCAL ROLE service_role;
UPDATE grida_billing.account SET metronome_customer_id = '' WHERE organization_id = current_setting('credits.local')::bigint;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', current_setting('credits.insider'), true);
-- 27: match the existing gate's empty-string behavior.
SELECT is((SELECT credits_provisioned FROM public.v_billing_credits WHERE organization_id = current_setting('credits.local')::bigint), false, 'empty customer identifier is not provisioned');

RESET ROLE;
SET LOCAL ROLE service_role;
DELETE FROM grida_billing.account WHERE organization_id = current_setting('credits.local')::bigint;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', current_setting('credits.insider'), true);
-- 28–29: missing account cannot masquerade as missing organization or zero credits.
SELECT is((SELECT count(*) FROM public.v_billing_credits WHERE organization_id = current_setting('credits.local')::bigint), 1::bigint, 'left join preserves the member organization with missing billing account');
SELECT is((SELECT jsonb_build_array(account_present, credits_provisioned, cached_balance_cents, cached_balance_at, customer_entitled) FROM public.v_billing_credits WHERE organization_id = current_setting('credits.local')::bigint), '[false,false,null,null,null]'::jsonb, 'missing account has false presence and nullable raw billing fields');

RESET ROLE;
SET LOCAL ROLE service_role;
INSERT INTO public.organization_member (organization_id, user_id)
VALUES (current_setting('credits.local')::bigint, current_setting('credits.alice')::uuid);
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', current_setting('credits.alice'), true);
-- 30–31: all members may read, but removed membership cannot return a billing row.
SELECT is((SELECT count(*) FROM public.v_billing_credits WHERE organization_id = current_setting('credits.local')::bigint), 1::bigint, 'non-owner member can read credits even when billing account is missing');
RESET ROLE;
SET LOCAL ROLE service_role;
DELETE FROM public.organization_member WHERE organization_id = current_setting('credits.local')::bigint AND user_id = current_setting('credits.alice')::uuid;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', current_setting('credits.alice'), true);
SELECT is((SELECT count(*) FROM public.v_billing_credits WHERE organization_id = current_setting('credits.local')::bigint), 0::bigint, 'removed member loses organization row rather than seeing missing billing');

RESET ROLE;
SELECT * FROM finish();
ROLLBACK;
