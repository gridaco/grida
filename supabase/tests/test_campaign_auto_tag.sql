BEGIN;
SELECT plan(10);

-- ---------------------------------------------------------------------------
-- Setup: two tenants (local + acme), each with a project, campaign, customers,
-- referrer, and invitation. All done as service_role (bypasses RLS).
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  -- local tenant
  v_local_org_id bigint;
  v_local_project_id bigint;
  v_local_project_name text :=
    'at-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8);
  v_local_campaign_id uuid;
  v_local_referrer_customer_uid uuid;
  v_local_invitee_customer_uid uuid;
  v_local_referrer_id uuid;
  v_local_invitation_code text;
  -- acme tenant
  v_acme_org_id bigint;
  v_acme_project_id bigint;
  v_acme_project_name text :=
    'aa-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8);
  v_acme_customer_uid uuid;
BEGIN
  -- Resolve seeded orgs
  SELECT id INTO v_local_org_id FROM public.organization WHERE name = 'local' LIMIT 1;
  IF v_local_org_id IS NULL THEN RAISE EXCEPTION 'seed org "local" not found'; END IF;

  SELECT id INTO v_acme_org_id FROM public.organization WHERE name = 'acme' LIMIT 1;
  IF v_acme_org_id IS NULL THEN RAISE EXCEPTION 'seed org "acme" not found'; END IF;

  SET LOCAL ROLE service_role;

  -- ===== LOCAL tenant =====
  INSERT INTO public.project (organization_id, name)
  VALUES (v_local_org_id, v_local_project_name)
  RETURNING id INTO v_local_project_id;

  INSERT INTO public.customer (project_id, uuid, email, name)
  VALUES (v_local_project_id, gen_random_uuid(), 'referrer@example.com', 'Referrer')
  RETURNING uid INTO v_local_referrer_customer_uid;

  INSERT INTO public.customer (project_id, uuid, email, name)
  VALUES (v_local_project_id, gen_random_uuid(), 'invitee@example.com', 'Invitee')
  RETURNING uid INTO v_local_invitee_customer_uid;

  v_local_campaign_id := gen_random_uuid();

  INSERT INTO public.document (id, doctype, project_id, title)
  VALUES (v_local_campaign_id, 'v0_campaign_referral', v_local_project_id, 'Local Auto-Tag Campaign');

  INSERT INTO grida_west_referral.campaign (
    id, project_id, title,
    ciam_invitee_on_claim_tag_names
  )
  VALUES (
    v_local_campaign_id, v_local_project_id, 'Local Auto-Tag Campaign',
    ARRAY['invitee-tag', 'campaign-member']
  );

  INSERT INTO grida_west_referral.referrer (project_id, campaign_id, customer_id)
  VALUES (v_local_project_id, v_local_campaign_id, v_local_referrer_customer_uid)
  RETURNING id INTO v_local_referrer_id;

  INSERT INTO grida_west_referral.invitation (campaign_id, referrer_id)
  VALUES (v_local_campaign_id, v_local_referrer_id)
  RETURNING code INTO v_local_invitation_code;

  -- ===== ACME tenant =====
  INSERT INTO public.project (organization_id, name)
  VALUES (v_acme_org_id, v_acme_project_name)
  RETURNING id INTO v_acme_project_id;

  INSERT INTO public.customer (project_id, uuid, email, name)
  VALUES (v_acme_project_id, gen_random_uuid(), 'acme-customer@example.com', 'Acme Customer')
  RETURNING uid INTO v_acme_customer_uid;

  RESET ROLE;

  -- Stash IDs
  PERFORM set_config('test.local_project_id', v_local_project_id::text, false);
  PERFORM set_config('test.local_campaign_id', v_local_campaign_id::text, false);
  PERFORM set_config('test.local_invitee_uid', v_local_invitee_customer_uid::text, false);
  PERFORM set_config('test.local_invitation_code', v_local_invitation_code, false);
  PERFORM set_config('test.acme_project_id', v_acme_project_id::text, false);
  PERFORM set_config('test.acme_customer_uid', v_acme_customer_uid::text, false);
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


-- =========================================================================
-- HAPPY PATH: claim triggers auto-tag
-- =========================================================================

-- Test 1: Invitee has NO tags before claim
SELECT ok(
  NOT EXISTS(
    SELECT 1 FROM grida_ciam.customer_tag
    WHERE customer_uid = current_setting('test.local_invitee_uid')::uuid
      AND project_id = current_setting('test.local_project_id')::bigint
      AND tag_name = 'invitee-tag'
  ),
  'invitee should NOT have invitee-tag before claiming'
);

-- Claim the invitation (as service_role, same as the public API route)
DO $$
BEGIN
  SET LOCAL ROLE service_role;
  PERFORM grida_west_referral.claim(
    current_setting('test.local_campaign_id')::uuid,
    current_setting('test.local_invitation_code'),
    current_setting('test.local_invitee_uid')::uuid
  );
  RESET ROLE;
END $$;

-- Test 2: Invitee customer has 'invitee-tag' after claim
SELECT ok(
  EXISTS(
    SELECT 1 FROM grida_ciam.customer_tag
    WHERE customer_uid = current_setting('test.local_invitee_uid')::uuid
      AND project_id = current_setting('test.local_project_id')::bigint
      AND tag_name = 'invitee-tag'
  ),
  'invitee customer should have invitee-tag after claiming'
);

-- Test 3: Invitee customer has 'campaign-member' after claim
SELECT ok(
  EXISTS(
    SELECT 1 FROM grida_ciam.customer_tag
    WHERE customer_uid = current_setting('test.local_invitee_uid')::uuid
      AND project_id = current_setting('test.local_project_id')::bigint
      AND tag_name = 'campaign-member'
  ),
  'invitee customer should have campaign-member tag after claiming'
);

-- Test 4: 'invitee-tag' was auto-created in public.tag
SELECT ok(
  EXISTS(
    SELECT 1 FROM public.tag
    WHERE project_id = current_setting('test.local_project_id')::bigint
      AND name = 'invitee-tag'
  ),
  'invitee-tag should be auto-created in public.tag on claim'
);

-- Test 5: 'campaign-member' was auto-created in public.tag
SELECT ok(
  EXISTS(
    SELECT 1 FROM public.tag
    WHERE project_id = current_setting('test.local_project_id')::bigint
      AND name = 'campaign-member'
  ),
  'campaign-member tag should be auto-created in public.tag on claim'
);


-- =========================================================================
-- TENANT ISOLATION: tags do NOT leak to acme project
-- =========================================================================

-- Test 6: Auto-created tags do not appear under the acme project
SELECT ok(
  NOT EXISTS(
    SELECT 1 FROM public.tag
    WHERE project_id = current_setting('test.acme_project_id')::bigint
      AND name IN ('invitee-tag', 'campaign-member')
  ),
  'auto-created tags should NOT appear under acme project'
);

-- Test 7: Acme customer has no tags from the local campaign claim
SELECT ok(
  NOT EXISTS(
    SELECT 1 FROM grida_ciam.customer_tag
    WHERE customer_uid = current_setting('test.acme_customer_uid')::uuid
      AND tag_name IN ('invitee-tag', 'campaign-member')
  ),
  'acme customer should have no tags from local campaign'
);

-- Test 8: apply_customer_tags silently rejects cross-project customer
--   (acme customer + local project_id => no-op)
DO $$
BEGIN
  SET LOCAL ROLE service_role;
  PERFORM grida_west_referral.apply_customer_tags(
    current_setting('test.acme_customer_uid')::uuid,
    current_setting('test.local_project_id')::bigint,
    ARRAY['rogue-tag']
  );
  RESET ROLE;
END $$;

SELECT ok(
  NOT EXISTS(
    SELECT 1 FROM grida_ciam.customer_tag
    WHERE customer_uid = current_setting('test.acme_customer_uid')::uuid
      AND tag_name = 'rogue-tag'
  ),
  'apply_customer_tags should reject cross-project customer (no tag written)'
);

SELECT ok(
  NOT EXISTS(
    SELECT 1 FROM public.tag
    WHERE project_id = current_setting('test.local_project_id')::bigint
      AND name = 'rogue-tag'
  ),
  'apply_customer_tags should not create tag row for cross-project attempt'
);


-- =========================================================================
-- PRIVILEGE: authenticated users cannot call apply_customer_tags directly
-- =========================================================================

-- Test 10: Insider (authenticated) cannot execute apply_customer_tags
SELECT test_set_auth('insider@grida.co');
SELECT throws_ok(
  format(
    'SELECT grida_west_referral.apply_customer_tags(%L::uuid, %s::bigint, ARRAY[''test''])',
    current_setting('test.local_invitee_uid'),
    current_setting('test.local_project_id')
  ),
  '42501',  -- insufficient_privilege
  NULL,
  'authenticated user should be denied EXECUTE on apply_customer_tags'
);
SELECT test_reset_auth();


SELECT * FROM finish();
ROLLBACK;
