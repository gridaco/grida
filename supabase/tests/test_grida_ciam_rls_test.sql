BEGIN;
SELECT plan(22);

-- Get user IDs and project ID from seed data
DO $$
DECLARE
  insider_user_id uuid;
  outsider_user_id uuid;
  test_project_id bigint;
  test_customer_uid uuid;
  test_tag_name text := 'test-tag';
BEGIN
  -- Get user IDs
  SELECT id INTO insider_user_id FROM auth.users WHERE email = 'insider@grida.co';
  SELECT id INTO outsider_user_id FROM auth.users WHERE email = 'random@example.com';
  SELECT id INTO test_project_id FROM public.project WHERE name = 'dev';
  
  -- Store in temp variables for later use
  PERFORM set_config('test.insider_user_id', insider_user_id::text, false);
  PERFORM set_config('test.outsider_user_id', outsider_user_id::text, false);
  PERFORM set_config('test.project_id', test_project_id::text, false);
  
  -- Create test customer (as service_role, bypassing RLS)
  INSERT INTO public.customer (project_id, uuid, email, name)
  VALUES (test_project_id, gen_random_uuid(), 'test-customer@example.com', 'Test Customer')
  RETURNING uid INTO test_customer_uid;
  
  PERFORM set_config('test.customer_uid', test_customer_uid::text, false);
  
  -- Create test tag in public.tag first (required for foreign key)
  INSERT INTO public.tag (project_id, name)
  VALUES (test_project_id, test_tag_name)
  ON CONFLICT (project_id, name) DO NOTHING;
  
  -- Create test customer_tag (as service_role, bypassing RLS)
  INSERT INTO grida_ciam.customer_tag (customer_uid, project_id, tag_name)
  VALUES (test_customer_uid, test_project_id, test_tag_name);
  
END $$;

-- Helper function to set auth context
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

-- Helper function to reset auth context
CREATE OR REPLACE FUNCTION test_reset_auth()
RETURNS void
LANGUAGE sql
AS $$
  SELECT set_config('request.jwt.claim.sub', '', true);
  RESET ROLE;
$$;

---------------------------------------------------------------------
-- Tests for customer_tag view (grida_ciam_public.customer_tag)
---------------------------------------------------------------------

-- Test 1: Insider (organization member) can see customer_tag
SELECT test_set_auth('insider@grida.co');
SELECT ok(
  EXISTS (
    SELECT 1
    FROM grida_ciam_public.customer_tag
    WHERE project_id = (SELECT id FROM public.project WHERE name = 'dev')
      AND tag_name = 'test-tag'
  ),
  'Insider (organization member) should see customer_tag'
);
SELECT test_reset_auth();

-- Test 2: Random user (not a member) cannot see customer_tag (rejection test)
SELECT test_set_auth('random@example.com');
SELECT ok(
  NOT EXISTS (
    SELECT 1
    FROM grida_ciam_public.customer_tag
    WHERE project_id = (SELECT id FROM public.project WHERE name = 'dev')
      AND tag_name = 'test-tag'
  ),
  'Random user (not a member) should be REJECTED from seeing customer_tag'
);
SELECT test_reset_auth();

-- Test 3: Anon cannot see customer_tag (rejection test)
SET ROLE anon;
SELECT ok(
  NOT EXISTS (
    SELECT 1
    FROM grida_ciam_public.customer_tag
    WHERE project_id = (SELECT id FROM public.project WHERE name = 'dev')
      AND tag_name = 'test-tag'
  ),
  'Anon should be REJECTED from seeing customer_tag'
);
RESET ROLE;

-- Test 4: Service role can bypass RLS and see customer_tag
SET ROLE service_role;
SELECT ok(
  EXISTS (
    SELECT 1
    FROM grida_ciam_public.customer_tag
    WHERE project_id = (SELECT id FROM public.project WHERE name = 'dev')
      AND tag_name = 'test-tag'
  ),
  'Service role should bypass RLS and see customer_tag'
);
RESET ROLE;

---------------------------------------------------------------------
-- Tests for customer_with_tags view (grida_ciam_public.customer_with_tags)
---------------------------------------------------------------------

-- Test 5: Insider can see customer_with_tags (view uses RLS from customer table)
SELECT test_set_auth('insider@grida.co');
SELECT ok(
  EXISTS (
    SELECT 1
    FROM grida_ciam_public.customer_with_tags
    WHERE project_id = (SELECT id FROM public.project WHERE name = 'dev')
      AND email = 'test-customer@example.com'
  ),
  'Insider (organization member) should see customer_with_tags'
);
SELECT test_reset_auth();

-- Test 6: Random user cannot see customer_with_tags (rejection test)
SELECT test_set_auth('random@example.com');
SELECT ok(
  NOT EXISTS (
    SELECT 1
    FROM grida_ciam_public.customer_with_tags
    WHERE project_id = (SELECT id FROM public.project WHERE name = 'dev')
      AND email = 'test-customer@example.com'
  ),
  'Random user (not a member) should be REJECTED from seeing customer_with_tags'
);
SELECT test_reset_auth();

-- Test 7: Anon cannot see customer_with_tags (rejection test)
SET ROLE anon;
SELECT ok(
  NOT EXISTS (
    SELECT 1
    FROM grida_ciam_public.customer_with_tags
    WHERE project_id = (SELECT id FROM public.project WHERE name = 'dev')
      AND email = 'test-customer@example.com'
  ),
  'Anon should be REJECTED from seeing customer_with_tags'
);
RESET ROLE;

-- Test 8: Service role can bypass RLS and see customer_with_tags
SET ROLE service_role;
SELECT ok(
  EXISTS (
    SELECT 1
    FROM grida_ciam_public.customer_with_tags
    WHERE project_id = (SELECT id FROM public.project WHERE name = 'dev')
      AND email = 'test-customer@example.com'
  ),
  'Service role should bypass RLS and see customer_with_tags'
);
RESET ROLE;

---------------------------------------------------------------------
-- Tests for tag_with_usage view (grida_ciam_public.tag_with_usage)
---------------------------------------------------------------------

-- Test 9: Insider can see tag_with_usage with usage_count
SELECT test_set_auth('insider@grida.co');
SELECT ok(
  EXISTS (
    SELECT 1
    FROM grida_ciam_public.tag_with_usage
    WHERE project_id = (SELECT id FROM public.project WHERE name = 'dev')
      AND name = 'test-tag'
      AND usage_count > 0
  ),
  'Insider (organization member) should see tag_with_usage with usage_count'
);
SELECT test_reset_auth();

-- Test 10: Random user cannot see tag_with_usage (rejection test)
SELECT test_set_auth('random@example.com');
SELECT ok(
  NOT EXISTS (
    SELECT 1
    FROM grida_ciam_public.tag_with_usage
    WHERE project_id = (SELECT id FROM public.project WHERE name = 'dev')
      AND name = 'test-tag'
  ),
  'Random user (not a member) should be REJECTED from seeing tag_with_usage'
);
SELECT test_reset_auth();

-- Test 11: Anon cannot see tag_with_usage (rejection test)
SET ROLE anon;
SELECT ok(
  NOT EXISTS (
    SELECT 1
    FROM grida_ciam_public.tag_with_usage
    WHERE project_id = (SELECT id FROM public.project WHERE name = 'dev')
      AND name = 'test-tag'
  ),
  'Anon should be REJECTED from seeing tag_with_usage'
);
RESET ROLE;

-- Test 12: Service role can bypass RLS and see tag_with_usage
SET ROLE service_role;
SELECT ok(
  EXISTS (
    SELECT 1
    FROM grida_ciam_public.tag_with_usage
    WHERE project_id = (SELECT id FROM public.project WHERE name = 'dev')
      AND name = 'test-tag'
  ),
  'Service role should bypass RLS and see tag_with_usage'
);
RESET ROLE;

---------------------------------------------------------------------
-- Tests for customer_auth_policy view (grida_ciam_public.customer_auth_policy)
---------------------------------------------------------------------

-- Create test customer_auth_policy data (as service_role, bypassing RLS)
DO $$
DECLARE
  test_project_id bigint;
BEGIN
  SELECT id INTO test_project_id FROM public.project WHERE name = 'dev';
  INSERT INTO grida_ciam.customer_auth_policy (project_id, name, challenges, scopes)
  VALUES (test_project_id, 'Test Policy', ARRAY['{"type":"passcode"}']::jsonb[], ARRAY['read'])
  ON CONFLICT DO NOTHING;
END $$;

-- Test 13: Insider cannot see customer_auth_policy (no RLS policy = default deny)
SELECT test_set_auth('insider@grida.co');
SELECT is(
  (SELECT COUNT(*) FROM grida_ciam_public.customer_auth_policy WHERE project_id = (SELECT id FROM public.project WHERE name = 'dev')),
  0::bigint,
  'Insider should not see customer_auth_policy (no RLS policy = default deny)'
);
SELECT test_reset_auth();

-- Test 14: Service role can see customer_auth_policy (bypasses RLS)
SET ROLE service_role;
SELECT ok(
  EXISTS (
    SELECT 1
    FROM grida_ciam_public.customer_auth_policy
    WHERE project_id = (SELECT id FROM public.project WHERE name = 'dev')
      AND name = 'Test Policy'
  ),
  'Service role should bypass RLS and see customer_auth_policy'
);
RESET ROLE;

---------------------------------------------------------------------
-- Tests for data isolation and RLS policy verification
---------------------------------------------------------------------

-- Test 15: Verify customer_tag RLS policy uses rls_project function
SELECT matches(
  (
    SELECT qual
    FROM pg_policies
    WHERE schemaname = 'grida_ciam'
      AND tablename = 'customer_tag'
      AND policyname = 'customer_tag_rls_policy'
  ),
  'rls_project',
  'customer_tag RLS policy should use rls_project function'
);

-- Test 16: Verify customer_tag RLS policy covers ALL operations
SELECT is(
  (
    SELECT cmd
    FROM pg_policies
    WHERE schemaname = 'grida_ciam'
      AND tablename = 'customer_tag'
      AND policyname = 'customer_tag_rls_policy'
  ),
  'ALL',
  'customer_tag RLS policy should cover ALL operations'
);

-- Test 17: Verify views use security_invoker = true
SELECT is(
  (
    SELECT COUNT(*)
    FROM pg_views v
    JOIN pg_class c ON c.relname = v.viewname
    JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = v.schemaname
    WHERE v.schemaname = 'grida_ciam_public'
      AND v.viewname IN ('customer_auth_policy', 'customer_tag', 'customer_with_tags', 'tag_with_usage')
      AND c.reloptions IS NOT NULL
      AND array_to_string(c.reloptions, ',') LIKE '%security_invoker=true%'
  ),
  4::bigint,
  'All 4 views should have security_invoker = true'
);

-- Test 18: Verify data isolation - insider only sees their project's data
SELECT test_set_auth('insider@grida.co');
SELECT is(
  (
    SELECT COUNT(*)
    FROM grida_ciam_public.customer_tag
    WHERE project_id != (SELECT id FROM public.project WHERE name = 'dev')
  ),
  0::bigint,
  'Insider should only see data from their project (data isolation)'
);
SELECT test_reset_auth();

-- Test 19: Verify customer_with_tags includes tags array correctly
SELECT test_set_auth('insider@grida.co');
SELECT ok(
  (
    SELECT tags IS NOT NULL AND array_length(tags, 1) > 0
    FROM grida_ciam_public.customer_with_tags
    WHERE project_id = (SELECT id FROM public.project WHERE name = 'dev')
      AND email = 'test-customer@example.com'
    LIMIT 1
  ),
  'customer_with_tags should include tags array with data'
);
SELECT test_reset_auth();

---------------------------------------------------------------------
-- Tests for multi-tenant isolation (alice cannot see insider's data)
---------------------------------------------------------------------

-- Test 20: Alice (acme org) cannot see insider's customers from local org (rejection test)
SELECT test_set_auth('alice@acme.com');
SELECT ok(
  NOT EXISTS (
    SELECT 1
    FROM grida_ciam_public.customer_with_tags
    WHERE project_id = (SELECT id FROM public.project WHERE name = 'dev' AND organization_id = (SELECT id FROM public.organization WHERE name = 'local'))
      AND email = 'test-customer@example.com'
  ),
  'Alice (acme org) should be REJECTED from seeing customers from insider''s local org (multi-tenant isolation)'
);
SELECT test_reset_auth();

-- Test 21: Alice (acme org) cannot see insider's customer_tags from local org (rejection test)
SELECT test_set_auth('alice@acme.com');
SELECT ok(
  NOT EXISTS (
    SELECT 1
    FROM grida_ciam_public.customer_tag
    WHERE project_id = (SELECT id FROM public.project WHERE name = 'dev' AND organization_id = (SELECT id FROM public.organization WHERE name = 'local'))
      AND tag_name = 'test-tag'
  ),
  'Alice (acme org) should be REJECTED from seeing customer_tags from insider''s local org (multi-tenant isolation)'
);
SELECT test_reset_auth();

-- Test 22: Alice (acme org) cannot see insider's tag_with_usage from local org (rejection test)
SELECT test_set_auth('alice@acme.com');
SELECT ok(
  NOT EXISTS (
    SELECT 1
    FROM grida_ciam_public.tag_with_usage
    WHERE project_id = (SELECT id FROM public.project WHERE name = 'dev' AND organization_id = (SELECT id FROM public.organization WHERE name = 'local'))
      AND name = 'test-tag'
  ),
  'Alice (acme org) should be REJECTED from seeing tag_with_usage from insider''s local org (multi-tenant isolation)'
);
SELECT test_reset_auth();

SELECT * FROM finish();
ROLLBACK;
