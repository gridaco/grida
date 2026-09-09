-- GRIDA-EE: billing
-- pgTAP regression: billing RPCs are a service-role boundary, including
-- effective EXECUTE inherited from PUBLIC or Supabase's default grants.
-- Member reads remain available through the intended, tenant-scoped views.
-- Uses the canonical local seed; every synthetic change rolls back.

BEGIN;

-- 18 RPCs x 4 ACL assertions + 1 complete-catalog assertion +
-- 4 service-role round trips + 8 denied RPC calls + 10 view assertions +
-- 2 denied direct writes + 2 unchanged-cache assertions.
SELECT plan(99);

-- Keep exact signatures: a new RPC or overload must join this inventory
-- and receive the same role checks. Sources: the base billing migration,
-- 20260508130000 (Metronome), and 20260512000000 (AI-credit markers).
CREATE TEMP TABLE billing_rpc_signatures (signature text PRIMARY KEY);
INSERT INTO billing_rpc_signatures (signature) VALUES
  ('public.fn_billing_apply_metronome_event(text, text, jsonb)'),
  ('public.fn_billing_apply_stripe_event(text, text, jsonb)'),
  ('public.fn_billing_attach_stripe_customer(bigint, text)'),
  ('public.fn_billing_debit_balance_cache(bigint, bigint, bigint)'),
  ('public.fn_billing_get_active_subscription(bigint)'),
  ('public.fn_billing_get_ai_credit_processed(text)'),
  ('public.fn_billing_get_catalogue(text)'),
  ('public.fn_billing_get_customer_id(bigint)'),
  ('public.fn_billing_get_metronome_account(bigint)'),
  ('public.fn_billing_list_metronome_events(bigint, integer)'),
  ('public.fn_billing_list_provisioned_orgs()'),
  ('public.fn_billing_resolve_org_by_metronome_customer(text)'),
  ('public.fn_billing_set_auto_reload(bigint, boolean, integer, integer)'),
  ('public.fn_billing_set_balance_cache(bigint, bigint, boolean)'),
  ('public.fn_billing_set_metronome_ids(bigint, text, text)'),
  ('public.fn_billing_setup_product(text, text, text)'),
  ('public.fn_billing_stamp_ai_credit_processed(text, text)'),
  ('public.fn_billing_stamp_failure(text, text, text)');

WITH actual AS (
  SELECT format('public.%s(%s)', p.proname, oidvectortypes(p.proargtypes)) AS signature
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname ~ '^fn_billing_'
)
SELECT is(
  (SELECT array_agg(signature ORDER BY signature) FROM actual),
  (SELECT array_agg(signature ORDER BY signature) FROM billing_rpc_signatures),
  'all public billing RPCs and overloads are covered by the explicit inventory'
);

SELECT ok(
  NOT has_function_privilege('anon', to_regprocedure(signature), 'EXECUTE'),
  'anon cannot execute ' || signature
)
FROM billing_rpc_signatures ORDER BY signature;

SELECT ok(
  NOT has_function_privilege('authenticated', to_regprocedure(signature), 'EXECUTE'),
  'authenticated cannot execute ' || signature
)
FROM billing_rpc_signatures ORDER BY signature;

SELECT ok(
  has_function_privilege('service_role', to_regprocedure(signature), 'EXECUTE'),
  'service_role can execute ' || signature
)
FROM billing_rpc_signatures ORDER BY signature;

-- A NULL proacl means PostgreSQL's default ACL, including PUBLIC EXECUTE;
-- expand that default too, rather than treating NULL as locked down.
SELECT ok(
  NOT EXISTS (
    SELECT 1
      FROM pg_proc p
      CROSS JOIN LATERAL aclexplode(
        COALESCE(p.proacl, acldefault('f', p.proowner))
      ) acl
     WHERE p.oid = to_regprocedure(signature)
       AND acl.grantee = 0 AND acl.privilege_type = 'EXECUTE'
  ),
  'PUBLIC has no EXECUTE ACL on ' || signature
)
FROM billing_rpc_signatures ORDER BY signature;

-- Resolve regenerated seed UUIDs and organization IDs before switching roles.
DO $$
BEGIN
  PERFORM set_config('test.billing_insider_uid',
    (SELECT id::text FROM auth.users WHERE email = 'insider@grida.co'), true);
  PERFORM set_config('test.billing_alice_uid',
    (SELECT id::text FROM auth.users WHERE email = 'alice@acme.com'), true);
  PERFORM set_config('test.billing_random_uid',
    (SELECT id::text FROM auth.users WHERE email = 'random@example.com'), true);
  PERFORM set_config('test.billing_local_org',
    (SELECT id::text FROM public.organization WHERE name = 'local'), true);
  PERFORM set_config('test.billing_acme_org',
    (SELECT id::text FROM public.organization WHERE name = 'acme'), true);
END $$;

-- Actual service calls prove the intended server boundary still works.
SET LOCAL ROLE service_role;

SELECT lives_ok($$
  SELECT public.fn_billing_set_balance_cache(
    current_setting('test.billing_local_org')::bigint, 7300, true
  )
$$, 'service_role can refresh the local cache');

SELECT lives_ok($$
  SELECT public.fn_billing_set_balance_cache(
    current_setting('test.billing_acme_org')::bigint, 2900, false
  )
$$, 'service_role can refresh the acme cache');

SELECT results_eq($$
  SELECT organization_id, cached_balance_cents, customer_entitled
    FROM public.fn_billing_get_metronome_account(
      current_setting('test.billing_local_org')::bigint
    )
$$, $$
  VALUES (current_setting('test.billing_local_org')::bigint, 7300::bigint, true)
$$, 'service_role reads the synthetic local cache through the RPC');

SELECT results_eq($$
  SELECT organization_id, cached_balance_cents, customer_entitled
    FROM public.fn_billing_get_metronome_account(
      current_setting('test.billing_acme_org')::bigint
    )
$$, $$
  VALUES (current_setting('test.billing_acme_org')::bigint, 2900::bigint, false)
$$, 'service_role reads the synthetic acme cache through the RPC');

-- Owner-audit fixtures distinguish a filtered row from an empty table.
INSERT INTO grida_billing.audit (organization_id, operation, note) VALUES
  (current_setting('test.billing_local_org')::bigint, 'customer_attach', 'pgTAP billing RPC grants'),
  (current_setting('test.billing_acme_org')::bigint, 'customer_attach', 'pgTAP billing RPC grants');

-- Anonymous callers must fail at EXECUTE, before any definer body runs.
SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claim.sub', '', true);

SELECT throws_ok($$
  SELECT * FROM public.fn_billing_get_metronome_account(
    current_setting('test.billing_local_org')::bigint
  )
$$, '42501', 'permission denied for function fn_billing_get_metronome_account',
  'anon cannot read a billing account through the RPC');

SELECT throws_ok($$
  SELECT public.fn_billing_set_balance_cache(
    current_setting('test.billing_local_org')::bigint, 999900, false
  )
$$, '42501', 'permission denied for function fn_billing_set_balance_cache',
  'anon cannot overwrite the billing cache through the RPC');

-- Even organization owners use the member views, never these server RPCs.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', current_setting('test.billing_insider_uid'), true);

SELECT throws_ok($$
  SELECT * FROM public.fn_billing_get_metronome_account(
    current_setting('test.billing_local_org')::bigint
  )
$$, '42501', 'permission denied for function fn_billing_get_metronome_account',
  'an owner cannot call the billing reader for their own organization');

SELECT throws_ok($$
  SELECT public.fn_billing_set_balance_cache(
    current_setting('test.billing_local_org')::bigint, 999900, false
  )
$$, '42501', 'permission denied for function fn_billing_set_balance_cache',
  'an owner cannot call the cache writer for their own organization');

SELECT throws_ok($$
  SELECT * FROM public.fn_billing_get_metronome_account(
    current_setting('test.billing_acme_org')::bigint
  )
$$, '42501', 'permission denied for function fn_billing_get_metronome_account',
  'an owner cannot call the billing reader for another organization');

SELECT throws_ok($$
  SELECT public.fn_billing_set_balance_cache(
    current_setting('test.billing_acme_org')::bigint, 999900, true
  )
$$, '42501', 'permission denied for function fn_billing_set_balance_cache',
  'an owner cannot call the cache writer for another organization');

SELECT is(
  (SELECT count(*) FROM public.v_billing_subscription
    WHERE organization_id = current_setting('test.billing_local_org')::bigint),
  1::bigint, 'insider still reads the local subscription view'
);
SELECT is(
  (SELECT count(*) FROM public.v_billing_subscription
    WHERE organization_id = current_setting('test.billing_acme_org')::bigint),
  0::bigint, 'insider cannot read the acme subscription view'
);
SELECT is(
  (SELECT count(*) FROM public.v_billing_audit
    WHERE organization_id = current_setting('test.billing_local_org')::bigint
      AND note = 'pgTAP billing RPC grants'),
  1::bigint, 'owner insider still reads the local audit view'
);
SELECT is(
  (SELECT count(*) FROM public.v_billing_audit
    WHERE organization_id = current_setting('test.billing_acme_org')::bigint
      AND note = 'pgTAP billing RPC grants'),
  0::bigint, 'insider cannot read the acme audit view'
);

-- SELECT granted for the invoker views must not become a direct write path.
SELECT throws_ok($$
  UPDATE grida_billing.account SET cached_balance_cents = 999900
   WHERE organization_id = current_setting('test.billing_local_org')::bigint
   RETURNING *
$$, '42501', 'permission denied for table account',
  'authenticated cannot UPDATE their account with RETURNING');

SELECT throws_ok($$
  DELETE FROM grida_billing.account
   WHERE organization_id = current_setting('test.billing_local_org')::bigint
   RETURNING *
$$, '42501', 'permission denied for table account',
  'authenticated cannot DELETE their account with RETURNING');

SELECT set_config('request.jwt.claim.sub', current_setting('test.billing_alice_uid'), true);

SELECT is(
  (SELECT count(*) FROM public.v_billing_subscription
    WHERE organization_id = current_setting('test.billing_acme_org')::bigint),
  1::bigint, 'alice still reads the acme subscription view'
);
SELECT is(
  (SELECT count(*) FROM public.v_billing_subscription
    WHERE organization_id = current_setting('test.billing_local_org')::bigint),
  0::bigint, 'alice cannot read the local subscription view'
);
SELECT is(
  (SELECT count(*) FROM public.v_billing_audit
    WHERE organization_id = current_setting('test.billing_acme_org')::bigint
      AND note = 'pgTAP billing RPC grants'),
  1::bigint, 'owner alice still reads the acme audit view'
);
SELECT is(
  (SELECT count(*) FROM public.v_billing_audit
    WHERE organization_id = current_setting('test.billing_local_org')::bigint
      AND note = 'pgTAP billing RPC grants'),
  0::bigint, 'alice cannot read the local audit view'
);

SELECT set_config('request.jwt.claim.sub', current_setting('test.billing_random_uid'), true);

SELECT throws_ok($$
  SELECT * FROM public.fn_billing_get_metronome_account(
    current_setting('test.billing_local_org')::bigint
  )
$$, '42501', 'permission denied for function fn_billing_get_metronome_account',
  'a user with no membership cannot call the billing reader');

SELECT throws_ok($$
  SELECT public.fn_billing_set_balance_cache(
    current_setting('test.billing_local_org')::bigint, 999900, false
  )
$$, '42501', 'permission denied for function fn_billing_set_balance_cache',
  'a user with no membership cannot call the cache writer');

SELECT is(
  (SELECT count(*) FROM public.v_billing_subscription),
  0::bigint, 'a user with no membership sees no subscriptions'
);
SELECT is(
  (SELECT count(*) FROM public.v_billing_audit),
  0::bigint, 'a user with no membership sees no billing audit rows'
);

SET LOCAL ROLE service_role;

SELECT results_eq($$
  SELECT organization_id, cached_balance_cents, customer_entitled
    FROM public.fn_billing_get_metronome_account(
      current_setting('test.billing_local_org')::bigint
    )
$$, $$
  VALUES (current_setting('test.billing_local_org')::bigint, 7300::bigint, true)
$$, 'denied calls leave the local cache and entitlement unchanged');

SELECT results_eq($$
  SELECT organization_id, cached_balance_cents, customer_entitled
    FROM public.fn_billing_get_metronome_account(
      current_setting('test.billing_acme_org')::bigint
    )
$$, $$
  VALUES (current_setting('test.billing_acme_org')::bigint, 2900::bigint, false)
$$, 'denied calls leave the acme cache and entitlement unchanged');

RESET ROLE;
SELECT * FROM finish();
ROLLBACK;
