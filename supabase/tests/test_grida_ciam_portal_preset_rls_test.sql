BEGIN;
SELECT plan(16);

---------------------------------------------------------------------
-- Seed fixtures
---------------------------------------------------------------------

DO $$
DECLARE
  insider_user_id uuid;
  outsider_user_id uuid;
  alice_user_id uuid;
  test_project_id bigint;
  acme_project_id bigint;
  preset_a uuid;
  preset_b uuid;
BEGIN
  SELECT id INTO insider_user_id FROM auth.users WHERE email = 'insider@grida.co';
  SELECT id INTO outsider_user_id FROM auth.users WHERE email = 'random@example.com';
  SELECT id INTO alice_user_id   FROM auth.users WHERE email = 'alice@acme.com';
  SELECT id INTO test_project_id FROM public.project WHERE name = 'dev';
  SELECT id INTO acme_project_id FROM public.project
    WHERE organization_id = (SELECT id FROM public.organization WHERE name = 'acme')
    LIMIT 1;

  PERFORM set_config('test.insider_user_id', insider_user_id::text, false);
  PERFORM set_config('test.outsider_user_id', outsider_user_id::text, false);
  PERFORM set_config('test.alice_user_id', alice_user_id::text, false);
  PERFORM set_config('test.project_id', test_project_id::text, false);
  PERFORM set_config('test.acme_project_id', COALESCE(acme_project_id::text, '0'), false);

  -- Create two presets for insider's project
  INSERT INTO grida_ciam.portal_preset (project_id, name, is_primary)
  VALUES (test_project_id, 'Default', true)
  RETURNING id INTO preset_a;

  INSERT INTO grida_ciam.portal_preset (project_id, name, is_primary)
  VALUES (test_project_id, 'Secondary', false)
  RETURNING id INTO preset_b;

  PERFORM set_config('test.preset_a', preset_a::text, false);
  PERFORM set_config('test.preset_b', preset_b::text, false);
END $$;

-- Reusable helpers (same as existing CIAM tests)
CREATE OR REPLACE FUNCTION test_set_auth(user_email text)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  user_id uuid;
BEGIN
  SELECT id INTO user_id FROM auth.users WHERE email = user_email;
  PERFORM set_config('request.jwt.claim.sub', user_id::text, true);
  SET LOCAL ROLE authenticated;
END;
$$;

CREATE OR REPLACE FUNCTION test_reset_auth()
RETURNS void
LANGUAGE sql
AS $$
  SELECT set_config('request.jwt.claim.sub', '', true);
  RESET ROLE;
$$;

---------------------------------------------------------------------
-- portal_preset read isolation
---------------------------------------------------------------------

-- Test 1: Insider can read their presets
SELECT test_set_auth('insider@grida.co');
SELECT is(
  (SELECT COUNT(*) FROM grida_ciam_public.portal_preset
   WHERE project_id = current_setting('test.project_id')::bigint),
  2::bigint,
  'Insider should see 2 portal presets for their project'
);
SELECT test_reset_auth();

-- Test 2: Outsider cannot see insider's presets
SELECT test_set_auth('random@example.com');
SELECT is(
  (SELECT COUNT(*) FROM grida_ciam_public.portal_preset
   WHERE project_id = current_setting('test.project_id')::bigint),
  0::bigint,
  'Outsider should not see portal presets from insider project'
);
SELECT test_reset_auth();

-- Test 3: Anon cannot see presets
SET ROLE anon;
SELECT is(
  (SELECT COUNT(*) FROM grida_ciam_public.portal_preset
   WHERE project_id = current_setting('test.project_id')::bigint),
  0::bigint,
  'Anon should not see portal presets'
);
RESET ROLE;

-- Test 4: Alice (acme) cannot see insider's presets
SELECT test_set_auth('alice@acme.com');
SELECT is(
  (SELECT COUNT(*) FROM grida_ciam_public.portal_preset
   WHERE project_id = current_setting('test.project_id')::bigint),
  0::bigint,
  'Alice (acme) should not see insider project portal presets'
);
SELECT test_reset_auth();

-- Test 5: Service role can see all
SET ROLE service_role;
SELECT ok(
  EXISTS (
    SELECT 1 FROM grida_ciam_public.portal_preset
    WHERE project_id = current_setting('test.project_id')::bigint
  ),
  'Service role should bypass RLS and see portal presets'
);
RESET ROLE;

---------------------------------------------------------------------
-- portal_preset write isolation
---------------------------------------------------------------------

-- Test 6: Insider can insert a preset into their project
SELECT test_set_auth('insider@grida.co');
SELECT lives_ok(
  $$
    INSERT INTO grida_ciam_public.portal_preset (project_id, name)
    VALUES (current_setting('test.project_id')::bigint, 'New Preset')
  $$,
  'Insider can insert preset into their project'
);
SELECT test_reset_auth();

-- Test 7: Outsider cannot insert a preset into insider's project
SELECT test_set_auth('random@example.com');
SELECT throws_ok(
  $$
    INSERT INTO grida_ciam_public.portal_preset (project_id, name)
    VALUES (current_setting('test.project_id')::bigint, 'Hacked')
  $$,
  NULL,
  NULL,
  'Outsider cannot insert preset into insider project'
);
SELECT test_reset_auth();

-- Test 8: Insider can update their own preset
SELECT test_set_auth('insider@grida.co');
SELECT lives_ok(
  format(
    'UPDATE grida_ciam_public.portal_preset SET name = %L WHERE id = %L',
    'Renamed',
    current_setting('test.preset_b')
  ),
  'Insider can update their own preset'
);
SELECT test_reset_auth();

-- Test 9: Outsider cannot update insider's preset
SELECT test_set_auth('random@example.com');
DO $$
DECLARE
  affected int;
BEGIN
  EXECUTE format(
    'UPDATE grida_ciam_public.portal_preset SET name = %L WHERE id = %L',
    'Hacked',
    current_setting('test.preset_b')
  );
  GET DIAGNOSTICS affected = ROW_COUNT;
  PERFORM set_config('test.outsider_update_count', affected::text, true);
END $$;
SELECT is(
  current_setting('test.outsider_update_count')::int,
  0,
  'Outsider update should affect 0 rows (RLS hides the row)'
);
SELECT test_reset_auth();

---------------------------------------------------------------------
-- set_primary_portal_preset RPC
---------------------------------------------------------------------

-- Test 10: Insider can set primary via RPC
SELECT test_set_auth('insider@grida.co');
SELECT lives_ok(
  format(
    $$SELECT grida_ciam_public.set_primary_portal_preset(%s, %L)$$,
    current_setting('test.project_id')::bigint,
    current_setting('test.preset_b')
  ),
  'Insider can call set_primary_portal_preset for their project'
);
SELECT test_reset_auth();

-- Test 11: After RPC, preset_b is primary and preset_a is not
SET ROLE service_role;
SELECT ok(
  (SELECT is_primary FROM grida_ciam.portal_preset
   WHERE id = current_setting('test.preset_b')::uuid),
  'preset_b should be primary after RPC'
);
SELECT ok(
  NOT (SELECT is_primary FROM grida_ciam.portal_preset
       WHERE id = current_setting('test.preset_a')::uuid),
  'preset_a should no longer be primary after RPC'
);
RESET ROLE;

-- Test 13: Outsider cannot call set_primary_portal_preset for insider's project
SELECT test_set_auth('random@example.com');
SELECT throws_ok(
  format(
    $$SELECT grida_ciam_public.set_primary_portal_preset(%s, %L)$$,
    current_setting('test.project_id')::bigint,
    current_setting('test.preset_a')
  ),
  NULL,
  NULL,
  'Outsider cannot call set_primary_portal_preset for insider project'
);
SELECT test_reset_auth();

---------------------------------------------------------------------
-- portal_preset delete isolation
---------------------------------------------------------------------

-- Test 14: Insider can delete their own preset
SELECT test_set_auth('insider@grida.co');
SELECT lives_ok(
  format(
    'DELETE FROM grida_ciam_public.portal_preset WHERE id = %L',
    current_setting('test.preset_b')
  ),
  'Insider can delete their own preset'
);
SELECT test_reset_auth();

-- Test 15: Outsider cannot delete insider's preset
SELECT test_set_auth('random@example.com');
DO $$
DECLARE
  affected int;
BEGIN
  EXECUTE format(
    'DELETE FROM grida_ciam_public.portal_preset WHERE id = %L',
    current_setting('test.preset_a')
  );
  GET DIAGNOSTICS affected = ROW_COUNT;
  PERFORM set_config('test.outsider_delete_count', affected::text, true);
END $$;
SELECT is(
  current_setting('test.outsider_delete_count')::int,
  0,
  'Outsider delete should affect 0 rows (RLS hides the row)'
);
SELECT test_reset_auth();

---------------------------------------------------------------------
-- view uses security_invoker
---------------------------------------------------------------------

-- Test 16: View has security_invoker = true
SELECT is(
  (SELECT COUNT(*)
   FROM pg_views v
   JOIN pg_class c ON c.relname = v.viewname
   JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = v.schemaname
   WHERE v.schemaname = 'grida_ciam_public'
     AND v.viewname = 'portal_preset'
     AND c.reloptions IS NOT NULL
     AND array_to_string(c.reloptions, ',') LIKE '%security_invoker=true%'),
  1::bigint,
  'portal_preset view should have security_invoker = true'
);

SELECT * FROM finish();
ROLLBACK;
