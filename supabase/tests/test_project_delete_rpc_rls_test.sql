BEGIN;
SELECT plan(12);

-- Setup: create throwaway projects under seeded orgs.
DO $$
DECLARE
  local_org_id bigint;
  acme_org_id bigint;
  local_project_id bigint;
  acme_project_id bigint;
  -- Keep project names short; grida_www assigns a derived www.name with max length 32.
  local_project_name text :=
    'tloc-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8);
  acme_project_name text :=
    'tacm-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8);
BEGIN
  -- Use seeded orgs
  SELECT id INTO local_org_id FROM public.organization WHERE name = 'local' LIMIT 1;
  IF local_org_id IS NULL THEN
    RAISE EXCEPTION 'seed org "local" not found';
  END IF;

  SELECT id INTO acme_org_id FROM public.organization WHERE name = 'acme' LIMIT 1;
  IF acme_org_id IS NULL THEN
    RAISE EXCEPTION 'seed org "acme" not found';
  END IF;

  -- Create projects as service_role (bypass RLS for setup)
  SET LOCAL ROLE service_role;
  INSERT INTO public.project (organization_id, name)
  VALUES (local_org_id, local_project_name)
  RETURNING id INTO local_project_id;

  INSERT INTO public.project (organization_id, name)
  VALUES (acme_org_id, acme_project_name)
  RETURNING id INTO acme_project_id;
  RESET ROLE;

  PERFORM set_config('test.project_id_local', local_project_id::text, false);
  PERFORM set_config('test.project_id_acme', acme_project_id::text, false);
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

-- 1) Sanity: local project exists (service_role)
SET ROLE service_role;
SELECT ok(
  EXISTS (
    SELECT 1
    FROM public.project
    WHERE id = current_setting('test.project_id_local')::bigint
  ),
  'Setup created local project'
);
RESET ROLE;

-- 2) Sanity: acme project exists (service_role)
SET ROLE service_role;
SELECT ok(
  EXISTS (
    SELECT 1
    FROM public.project
    WHERE id = current_setting('test.project_id_acme')::bigint
  ),
  'Setup created acme project'
);
RESET ROLE;

-- 3) Random user (not member) cannot delete local via RPC (RLS enforced)
SELECT test_set_auth('random@example.com');
SELECT is(
  public.delete_project(
    current_setting('test.project_id_local')::bigint,
    'DELETE whatever'
  ),
  false,
  'Random user cannot delete local project'
);
SELECT test_reset_auth();

-- 4) Insider cannot delete acme project (cross-tenant rejection)
SELECT test_set_auth('insider@grida.co');
SELECT is(
  public.delete_project(
    current_setting('test.project_id_acme')::bigint,
    'DELETE whatever'
  ),
  false,
  'Insider cannot delete acme project (cross-tenant)'
);
SELECT test_reset_auth();

-- 5) Alice (acme) cannot delete local project (cross-tenant rejection)
SELECT test_set_auth('alice@acme.com');
SELECT is(
  public.delete_project(
    current_setting('test.project_id_local')::bigint,
    'DELETE whatever'
  ),
  false,
  'Alice cannot delete local project (cross-tenant)'
);
SELECT test_reset_auth();

-- 6) Local project still exists after rejected deletes (service_role)
SET ROLE service_role;
SELECT ok(
  EXISTS (
    SELECT 1
    FROM public.project
    WHERE id = current_setting('test.project_id_local')::bigint
  ),
  'Local project not deleted by rejected callers'
);
RESET ROLE;

-- 7) Acme project still exists after rejected deletes (service_role)
SET ROLE service_role;
SELECT ok(
  EXISTS (
    SELECT 1
    FROM public.project
    WHERE id = current_setting('test.project_id_acme')::bigint
  ),
  'Acme project not deleted by rejected callers'
);
RESET ROLE;

-- 8) Insider (local member) can delete local project via RPC
SELECT test_set_auth('insider@grida.co');
SELECT is(
  public.delete_project(
    current_setting('test.project_id_local')::bigint,
    'DELETE ' ||
      (select name from public.project where id = current_setting('test.project_id_local')::bigint)
  ),
  true,
  'Insider can delete local project'
);
SELECT test_reset_auth();

-- 9) Local project is deleted (service_role sees it)
SET ROLE service_role;
SELECT ok(
  NOT EXISTS (
    SELECT 1
    FROM public.project
    WHERE id = current_setting('test.project_id_local')::bigint
  ),
  'Local project row is deleted'
);
RESET ROLE;

-- 10) Alice (acme member) cannot delete acme project with wrong confirmation
SELECT test_set_auth('alice@acme.com');
SELECT is(
  public.delete_project(current_setting('test.project_id_acme')::bigint, 'DELETE wrong'),
  false,
  'Alice cannot delete acme project with wrong confirmation'
);
SELECT test_reset_auth();

-- 10) Alice (acme member) can delete acme project via RPC
SELECT test_set_auth('alice@acme.com');
SELECT is(
  public.delete_project(
    current_setting('test.project_id_acme')::bigint,
    'DELETE ' ||
      (select name from public.project where id = current_setting('test.project_id_acme')::bigint)
  ),
  true,
  'Alice can delete acme project'
);
SELECT test_reset_auth();

-- 11) Acme project is deleted (service_role sees it)
SET ROLE service_role;
SELECT ok(
  NOT EXISTS (
    SELECT 1
    FROM public.project
    WHERE id = current_setting('test.project_id_acme')::bigint
  ),
  'Acme project row is deleted'
);
RESET ROLE;

SELECT * FROM finish();
ROLLBACK;

