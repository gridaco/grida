BEGIN;
SELECT plan(10);

-- ---------------------------------------------------------------------------
-- Setup: create throwaway projects and campaign fixtures under seeded orgs.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  local_org_id bigint;
  acme_org_id bigint;
  local_project_id bigint;
  acme_project_id bigint;
  local_project_name text :=
    'wrl-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8);
  acme_project_name text :=
    'wra-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8);
  local_campaign_id uuid;
  acme_campaign_id uuid;
  rogue_doc_for_acme uuid;
  rogue_doc_for_local uuid;
BEGIN
  -- Resolve seeded orgs
  SELECT id INTO local_org_id FROM public.organization WHERE name = 'local' LIMIT 1;
  IF local_org_id IS NULL THEN
    RAISE EXCEPTION 'seed org "local" not found';
  END IF;

  SELECT id INTO acme_org_id FROM public.organization WHERE name = 'acme' LIMIT 1;
  IF acme_org_id IS NULL THEN
    RAISE EXCEPTION 'seed org "acme" not found';
  END IF;

  -- Create projects (service_role bypasses RLS)
  SET LOCAL ROLE service_role;

  INSERT INTO public.project (organization_id, name)
  VALUES (local_org_id, local_project_name)
  RETURNING id INTO local_project_id;

  INSERT INTO public.project (organization_id, name)
  VALUES (acme_org_id, acme_project_name)
  RETURNING id INTO acme_project_id;

  -- Create base documents (campaign id = document id)
  local_campaign_id := gen_random_uuid();
  acme_campaign_id := gen_random_uuid();

  INSERT INTO public.document (id, doctype, project_id, title)
  VALUES (local_campaign_id, 'v0_campaign_referral', local_project_id, 'Local Campaign');

  INSERT INTO public.document (id, doctype, project_id, title)
  VALUES (acme_campaign_id, 'v0_campaign_referral', acme_project_id, 'Acme Campaign');

  -- Create campaigns
  INSERT INTO grida_west_referral.campaign (id, project_id, title)
  VALUES (local_campaign_id, local_project_id, 'Local Campaign');

  INSERT INTO grida_west_referral.campaign (id, project_id, title)
  VALUES (acme_campaign_id, acme_project_id, 'Acme Campaign');

  -- Pre-create documents for the rogue INSERT tests.
  -- This ensures a FK-valid id exists, so the only thing blocking the
  -- cross-tenant INSERT is the RLS WITH CHECK policy (not the FK).
  rogue_doc_for_acme := gen_random_uuid();
  rogue_doc_for_local := gen_random_uuid();

  INSERT INTO public.document (id, doctype, project_id, title)
  VALUES (rogue_doc_for_acme, 'v0_campaign_referral', acme_project_id, 'Rogue Acme');

  INSERT INTO public.document (id, doctype, project_id, title)
  VALUES (rogue_doc_for_local, 'v0_campaign_referral', local_project_id, 'Rogue Local');

  RESET ROLE;

  -- Stash IDs for assertions
  PERFORM set_config('test.project_id_local', local_project_id::text, false);
  PERFORM set_config('test.project_id_acme', acme_project_id::text, false);
  PERFORM set_config('test.campaign_id_local', local_campaign_id::text, false);
  PERFORM set_config('test.campaign_id_acme', acme_campaign_id::text, false);
  PERFORM set_config('test.rogue_doc_for_acme', rogue_doc_for_acme::text, false);
  PERFORM set_config('test.rogue_doc_for_local', rogue_doc_for_local::text, false);
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

-- =====================================================================
-- READ ISOLATION
-- =====================================================================

-- 1) Insider can read their own campaign
SELECT test_set_auth('insider@grida.co');
SELECT ok(
  EXISTS (
    SELECT 1 FROM grida_west_referral.campaign
    WHERE id = current_setting('test.campaign_id_local')::uuid
  ),
  'Insider can read own campaign'
);
SELECT test_reset_auth();

-- 2) Insider cannot read acme campaign (cross-tenant)
SELECT test_set_auth('insider@grida.co');
SELECT ok(
  NOT EXISTS (
    SELECT 1 FROM grida_west_referral.campaign
    WHERE id = current_setting('test.campaign_id_acme')::uuid
  ),
  'Insider cannot read acme campaign (cross-tenant)'
);
SELECT test_reset_auth();

-- 3) Alice can read her own campaign
SELECT test_set_auth('alice@acme.com');
SELECT ok(
  EXISTS (
    SELECT 1 FROM grida_west_referral.campaign
    WHERE id = current_setting('test.campaign_id_acme')::uuid
  ),
  'Alice can read own campaign'
);
SELECT test_reset_auth();

-- 4) Alice cannot read local campaign (cross-tenant)
SELECT test_set_auth('alice@acme.com');
SELECT ok(
  NOT EXISTS (
    SELECT 1 FROM grida_west_referral.campaign
    WHERE id = current_setting('test.campaign_id_local')::uuid
  ),
  'Alice cannot read local campaign (cross-tenant)'
);
SELECT test_reset_auth();

-- 5) Random user (no membership) cannot read any campaign
SELECT test_set_auth('random@example.com');
SELECT ok(
  NOT EXISTS (
    SELECT 1 FROM grida_west_referral.campaign
    WHERE id = current_setting('test.campaign_id_local')::uuid
  ),
  'Random user cannot read local campaign'
);
SELECT test_reset_auth();

-- 6) Random user (no membership) cannot read acme campaign
SELECT test_set_auth('random@example.com');
SELECT ok(
  NOT EXISTS (
    SELECT 1 FROM grida_west_referral.campaign
    WHERE id = current_setting('test.campaign_id_acme')::uuid
  ),
  'Random user cannot read acme campaign'
);
SELECT test_reset_auth();

-- =====================================================================
-- WRITE ISOLATION (INSERT)
-- Uses pre-created document ids so the FK is satisfied.
-- The ONLY reason the insert should fail is the RLS WITH CHECK policy.
-- We check for error code 42501 (insufficient_privilege / RLS violation).
-- =====================================================================

-- 7) Insider cannot insert a campaign into acme project
SELECT test_set_auth('insider@grida.co');
SELECT throws_ok(
  format(
    $$INSERT INTO grida_west_referral.campaign (id, project_id, title) VALUES (%L, %s, 'Rogue')$$,
    current_setting('test.rogue_doc_for_acme')::uuid,
    current_setting('test.project_id_acme')::bigint
  ),
  '42501',
  NULL,
  'Insider cannot insert campaign into acme project (RLS)'
);
SELECT test_reset_auth();

-- 8) Alice cannot insert a campaign into local project
SELECT test_set_auth('alice@acme.com');
SELECT throws_ok(
  format(
    $$INSERT INTO grida_west_referral.campaign (id, project_id, title) VALUES (%L, %s, 'Rogue')$$,
    current_setting('test.rogue_doc_for_local')::uuid,
    current_setting('test.project_id_local')::bigint
  ),
  '42501',
  NULL,
  'Alice cannot insert campaign into local project (RLS)'
);
SELECT test_reset_auth();

-- =====================================================================
-- UPDATE ISOLATION
-- The attacker attempts the UPDATE, then we switch to service_role
-- to verify the row title is unchanged. This avoids the false-positive
-- where the verification SELECT itself returns nothing due to RLS.
-- =====================================================================

-- 9) Insider cannot update acme campaign
SELECT test_set_auth('insider@grida.co');
DO $$
BEGIN
  UPDATE grida_west_referral.campaign
  SET title = 'Hacked'
  WHERE id = current_setting('test.campaign_id_acme')::uuid;
END $$;
SELECT test_reset_auth();

-- Verify as service_role (bypasses RLS) that the row is unchanged
SET LOCAL ROLE service_role;
SELECT is(
  (SELECT title FROM grida_west_referral.campaign
   WHERE id = current_setting('test.campaign_id_acme')::uuid),
  'Acme Campaign',
  'Insider cannot update acme campaign (cross-tenant)'
);
RESET ROLE;

-- 10) Alice cannot update local campaign
SELECT test_set_auth('alice@acme.com');
DO $$ BEGIN
  UPDATE grida_west_referral.campaign
  SET title = 'Hacked'
  WHERE id = current_setting('test.campaign_id_local')::uuid;
END $$;
SELECT test_reset_auth();

-- Verify as service_role (bypasses RLS) that the row is unchanged
SET LOCAL ROLE service_role;
SELECT is(
  (SELECT title FROM grida_west_referral.campaign
   WHERE id = current_setting('test.campaign_id_local')::uuid),
  'Local Campaign',
  'Alice cannot update local campaign (cross-tenant)'
);
RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
