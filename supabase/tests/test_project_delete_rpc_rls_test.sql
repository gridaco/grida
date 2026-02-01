BEGIN;
SELECT plan(6);

-- Setup: create a throwaway project under a seeded org.
DO $$
DECLARE
  org_id bigint;
  project_id bigint;
  project_name text := 'rls-delete-test-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8);
BEGIN
  -- Use seeded org
  SELECT id INTO org_id FROM public.organization WHERE name = 'local' LIMIT 1;
  IF org_id IS NULL THEN
    RAISE EXCEPTION 'seed org "local" not found';
  END IF;

  -- Create project as service_role (bypass RLS for setup)
  SET LOCAL ROLE service_role;
  INSERT INTO public.project (organization_id, name)
  VALUES (org_id, project_name)
  RETURNING id INTO project_id;
  RESET ROLE;

  PERFORM set_config('test.project_id', project_id::text, false);
END $$;

-- Helper: set auth context as authenticated user.
CREATE OR REPLACE FUNCTION test_set_auth(user_email text)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  user_id uuid;
BEGIN
  SELECT id INTO user_id FROM auth.users WHERE email = user_email;
  IF user_id IS NULL THEN
    RAISE EXCEPTION 'seed user not found: %', user_email;
  END IF;
  PERFORM set_config('request.jwt.claim.sub', user_id::text, true);
  SET LOCAL ROLE authenticated;
END;
$$;

-- Helper: reset auth context.
CREATE OR REPLACE FUNCTION test_reset_auth()
RETURNS void
LANGUAGE sql
AS $$
  SELECT set_config('request.jwt.claim.sub', '', true);
  RESET ROLE;
$$;

-- 1) Sanity: project exists (service_role)
SET ROLE service_role;
SELECT ok(
  EXISTS (SELECT 1 FROM public.project WHERE id = current_setting('test.project_id')::bigint),
  'Setup created a project'
);
RESET ROLE;

-- 2) Random user (not member) cannot delete via RPC (RLS enforced)
SELECT test_set_auth('random@example.com');
SELECT is(
  public.delete_project(current_setting('test.project_id')::bigint),
  false,
  'Non-member delete_project returns false (RLS enforced)'
);
SELECT test_reset_auth();

-- 3) Project still exists after rejected delete
SET ROLE service_role;
SELECT ok(
  EXISTS (SELECT 1 FROM public.project WHERE id = current_setting('test.project_id')::bigint),
  'Project not deleted by non-member'
);
RESET ROLE;

-- 4) Insider (member) can delete via RPC
SELECT test_set_auth('insider@grida.co');
SELECT is(
  public.delete_project(current_setting('test.project_id')::bigint),
  true,
  'Member delete_project returns true'
);

-- 5) Project is deleted for insider session
SELECT ok(
  NOT EXISTS (SELECT 1 FROM public.project WHERE id = current_setting('test.project_id')::bigint),
  'Project row is deleted'
);
SELECT test_reset_auth();

-- 6) Project is deleted (service_role sees it too)
SET ROLE service_role;
SELECT ok(
  NOT EXISTS (SELECT 1 FROM public.project WHERE id = current_setting('test.project_id')::bigint),
  'Project row is deleted (verified as service_role)'
);
RESET ROLE;

SELECT * FROM finish();
ROLLBACK;

