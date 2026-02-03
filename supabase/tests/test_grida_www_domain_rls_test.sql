BEGIN;
SELECT plan(13);

-- Setup: create throwaway projects and tenant www under seeded orgs.
DO $$
DECLARE
  local_org_id bigint;
  acme_org_id bigint;
  local_project_id bigint;
  acme_project_id bigint;
  local_www_id uuid;
  acme_www_id uuid;
  local_www_name text :=
    'tloc-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8);
  acme_www_name text :=
    'tacm-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8);
BEGIN
  SELECT id INTO local_org_id FROM public.organization WHERE name = 'local' LIMIT 1;
  IF local_org_id IS NULL THEN
    RAISE EXCEPTION 'seed org "local" not found';
  END IF;

  SELECT id INTO acme_org_id FROM public.organization WHERE name = 'acme' LIMIT 1;
  IF acme_org_id IS NULL THEN
    RAISE EXCEPTION 'seed org "acme" not found';
  END IF;

  SET LOCAL ROLE service_role;

  INSERT INTO public.project (organization_id, name)
  VALUES (local_org_id, 'tloc-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8))
  RETURNING id INTO local_project_id;

  INSERT INTO public.project (organization_id, name)
  VALUES (acme_org_id, 'tacm-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8))
  RETURNING id INTO acme_project_id;

  -- `grida_www.www` is 1:1 with project and may be auto-created in some setups.
  -- Upsert by project_id to keep this test robust.
  INSERT INTO grida_www.www (project_id, name)
  VALUES (local_project_id, local_www_name)
  ON CONFLICT (project_id) DO UPDATE SET name = EXCLUDED.name
  RETURNING id INTO local_www_id;

  INSERT INTO grida_www.www (project_id, name)
  VALUES (acme_project_id, acme_www_name)
  ON CONFLICT (project_id) DO UPDATE SET name = EXCLUDED.name
  RETURNING id INTO acme_www_id;

  -- Create active canonical domain for local tenant
  INSERT INTO grida_www.domain (www_id, hostname, status, canonical)
  VALUES (local_www_id, 'example.com', 'active', true);

  -- Create active domain for acme tenant
  INSERT INTO grida_www.domain (www_id, hostname, status, canonical)
  VALUES (acme_www_id, 'acme.example.com', 'active', true);

  RESET ROLE;

  PERFORM set_config('test.www_id_local', local_www_id::text, false);
  PERFORM set_config('test.www_id_acme', acme_www_id::text, false);
  PERFORM set_config('test.www_name_local', local_www_name::text, false);
  PERFORM set_config('test.www_name_acme', acme_www_name::text, false);
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

-- 1) Service role can see local active domain
SET ROLE service_role;
SELECT ok(
  EXISTS (
    SELECT 1 FROM grida_www.domain
    WHERE www_id = current_setting('test.www_id_local')::uuid
      AND hostname = 'example.com'
      AND status = 'active'
  ),
  'service_role can read local active domain'
);
RESET ROLE;

-- 2) Service role can see acme active domain
SET ROLE service_role;
SELECT ok(
  EXISTS (
    SELECT 1 FROM grida_www.domain
    WHERE www_id = current_setting('test.www_id_acme')::uuid
      AND hostname = 'acme.example.com'
      AND status = 'active'
  ),
  'service_role can read acme active domain'
);
RESET ROLE;

-- 3) Insider (local org member) can read local domain
SELECT test_set_auth('insider@grida.co');
SELECT ok(
  EXISTS (
    SELECT 1 FROM grida_www.domain
    WHERE www_id = current_setting('test.www_id_local')::uuid
      AND hostname = 'example.com'
  ),
  'insider can read local domain'
);
SELECT test_reset_auth();

-- 4) Alice (acme member) can read acme domain
SELECT test_set_auth('alice@acme.com');
SELECT ok(
  EXISTS (
    SELECT 1 FROM grida_www.domain
    WHERE www_id = current_setting('test.www_id_acme')::uuid
      AND hostname = 'acme.example.com'
  ),
  'alice can read acme domain'
);
SELECT test_reset_auth();

-- 5) Insider cannot read acme domain (cross-tenant rejection)
SELECT test_set_auth('insider@grida.co');
SELECT ok(
  NOT EXISTS (
    SELECT 1 FROM grida_www.domain
    WHERE www_id = current_setting('test.www_id_acme')::uuid
      AND hostname = 'acme.example.com'
  ),
  'insider cannot read acme domain'
);
SELECT test_reset_auth();

-- 6) Random user cannot read local domain (rejection)
SELECT test_set_auth('random@example.com');
SELECT ok(
  NOT EXISTS (
    SELECT 1 FROM grida_www.domain
    WHERE www_id = current_setting('test.www_id_local')::uuid
      AND hostname = 'example.com'
  ),
  'random cannot read local domain'
);
SELECT test_reset_auth();

-- 7) Anon cannot read domain rows (even active)
SET ROLE anon;
SELECT ok(
  NOT EXISTS (
    SELECT 1 FROM grida_www.domain
    WHERE hostname IN ('example.com', 'acme.example.com')
  ),
  'anon cannot enumerate domain mappings'
);
RESET ROLE;

-- 8) Insider can insert domain for local www
SELECT test_set_auth('insider@grida.co');
DO $$
BEGIN
  BEGIN
    INSERT INTO grida_www.domain (www_id, hostname, status, canonical)
    VALUES (current_setting('test.www_id_local')::uuid, 'app.example.com', 'pending', false);
    PERFORM set_config('test.insert_insider_ok', 'true', true);
  EXCEPTION WHEN others THEN
    PERFORM set_config('test.insert_insider_ok', 'false', true);
  END;
END $$;
SELECT is(current_setting('test.insert_insider_ok'), 'true', 'insider can insert domain for local www');
SELECT test_reset_auth();

-- 9) Random cannot insert domain for local www
SELECT test_set_auth('random@example.com');
DO $$
BEGIN
  BEGIN
    INSERT INTO grida_www.domain (www_id, hostname, status, canonical)
    VALUES (current_setting('test.www_id_local')::uuid, 'blocked.example.com', 'pending', false);
    PERFORM set_config('test.insert_random_ok', 'true', true);
  EXCEPTION WHEN others THEN
    PERFORM set_config('test.insert_random_ok', 'false', true);
  END;
END $$;
SELECT is(current_setting('test.insert_random_ok'), 'false', 'random cannot insert domain for local www');
SELECT test_reset_auth();

-- 10) Insider can update a local domain row
SELECT test_set_auth('insider@grida.co');
DO $$
DECLARE
  rc integer;
BEGIN
  BEGIN
    UPDATE grida_www.domain
    SET last_error = 'test',
        last_error_code = 'DNS_MISCONFIGURED',
        last_checked_at = now()
    WHERE www_id = current_setting('test.www_id_local')::uuid
      AND hostname = 'example.com';
    GET DIAGNOSTICS rc = ROW_COUNT;
    PERFORM set_config('test.update_insider_rowcount', rc::text, true);
  EXCEPTION WHEN others THEN
    PERFORM set_config('test.update_insider_rowcount', '-1', true);
  END;
END $$;
SELECT is(current_setting('test.update_insider_rowcount'), '1', 'insider can update local domain row (1 row)');
SELECT test_reset_auth();

-- 11) Random cannot update local domain row
SELECT test_set_auth('random@example.com');
DO $$
DECLARE
  rc integer;
BEGIN
  BEGIN
    UPDATE grida_www.domain
    SET last_error = 'hacked',
        last_error_code = 'VERCEL_API_ERROR',
        last_checked_at = now()
    WHERE www_id = current_setting('test.www_id_local')::uuid
      AND hostname = 'example.com';
    GET DIAGNOSTICS rc = ROW_COUNT;
    PERFORM set_config('test.update_random_rowcount', rc::text, true);
  EXCEPTION WHEN others THEN
    PERFORM set_config('test.update_random_rowcount', '-1', true);
  END;
END $$;
SELECT is(current_setting('test.update_random_rowcount'), '0', 'random cannot update local domain row (0 rows)');
SELECT test_reset_auth();

-- 12) Resolve function is not executable by anon (hardening)
SET ROLE anon;
DO $$
BEGIN
  BEGIN
    PERFORM public.www_resolve_hostname('example.com');
    PERFORM set_config('test.resolve_anon_ok', 'true', true);
  EXCEPTION WHEN others THEN
    PERFORM set_config('test.resolve_anon_ok', 'false', true);
  END;
END $$;
SELECT is(current_setting('test.resolve_anon_ok'), 'false', 'anon cannot execute www_resolve_hostname after hardening');
SELECT test_reset_auth();

-- 13) Canonical lookup function is not executable by anon (hardening)
SET ROLE anon;
DO $$
BEGIN
  BEGIN
    PERFORM public.www_get_canonical_hostname('example');
    PERFORM set_config('test.canon_anon_ok', 'true', true);
  EXCEPTION WHEN others THEN
    PERFORM set_config('test.canon_anon_ok', 'false', true);
  END;
END $$;
SELECT is(current_setting('test.canon_anon_ok'), 'false', 'anon cannot execute www_get_canonical_hostname after hardening');
RESET ROLE;

SELECT * FROM finish();
ROLLBACK;

