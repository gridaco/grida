BEGIN;
SELECT plan(5);

-- ---------------------------------------------------------------------------
-- Setup: create project, campaign, customers, referrer, invitation fixtures.
-- All done as service_role (bypasses RLS).
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_org_id bigint;
  v_project_id bigint;
  v_project_name text :=
    'at-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8);
  v_campaign_id uuid;
  v_referrer_customer_uid uuid;
  v_invitee_customer_uid uuid;
  v_referrer_id uuid;
  v_invitation_code text;
BEGIN
  -- Resolve seeded org
  SELECT id INTO v_org_id FROM public.organization WHERE name = 'local' LIMIT 1;
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'seed org "local" not found';
  END IF;

  SET LOCAL ROLE service_role;

  -- Create project
  INSERT INTO public.project (organization_id, name)
  VALUES (v_org_id, v_project_name)
  RETURNING id INTO v_project_id;

  -- Create customers
  INSERT INTO public.customer (project_id, uuid, email, name)
  VALUES (v_project_id, gen_random_uuid(), 'referrer@example.com', 'Referrer')
  RETURNING uid INTO v_referrer_customer_uid;

  INSERT INTO public.customer (project_id, uuid, email, name)
  VALUES (v_project_id, gen_random_uuid(), 'invitee@example.com', 'Invitee')
  RETURNING uid INTO v_invitee_customer_uid;

  -- Create campaign document + campaign with auto-tag config
  v_campaign_id := gen_random_uuid();

  INSERT INTO public.document (id, doctype, project_id, title)
  VALUES (v_campaign_id, 'v0_campaign_referral', v_project_id, 'Auto-Tag Campaign');

  INSERT INTO grida_west_referral.campaign (
    id, project_id, title,
    ciam_invitee_on_claim_tag_names
  )
  VALUES (
    v_campaign_id, v_project_id, 'Auto-Tag Campaign',
    ARRAY['invitee-tag', 'campaign-member']
  );

  -- Create referrer
  INSERT INTO grida_west_referral.referrer (project_id, campaign_id, customer_id)
  VALUES (v_project_id, v_campaign_id, v_referrer_customer_uid)
  RETURNING id INTO v_referrer_id;

  -- Create invitation (unclaimed initially)
  INSERT INTO grida_west_referral.invitation (campaign_id, referrer_id)
  VALUES (v_campaign_id, v_referrer_id)
  RETURNING code INTO v_invitation_code;

  RESET ROLE;

  -- Stash IDs
  PERFORM set_config('test.project_id', v_project_id::text, false);
  PERFORM set_config('test.campaign_id', v_campaign_id::text, false);
  PERFORM set_config('test.invitee_customer_uid', v_invitee_customer_uid::text, false);
  PERFORM set_config('test.invitation_code', v_invitation_code, false);
END $$;


-- =========================================================================
-- Test 1: Invitee has NO tags before claim (invitation is unclaimed)
-- =========================================================================
SELECT ok(
  NOT EXISTS(
    SELECT 1 FROM grida_ciam.customer_tag
    WHERE customer_uid = current_setting('test.invitee_customer_uid')::uuid
      AND project_id = current_setting('test.project_id')::bigint
      AND tag_name = 'invitee-tag'
  ),
  'invitee should NOT have invitee-tag before claiming'
);

-- =========================================================================
-- Claim the invitation (triggers auto-tag for invitee)
-- =========================================================================
DO $$
BEGIN
  SET LOCAL ROLE service_role;

  PERFORM grida_west_referral.claim(
    current_setting('test.campaign_id')::uuid,
    current_setting('test.invitation_code'),
    current_setting('test.invitee_customer_uid')::uuid
  );

  RESET ROLE;
END $$;

-- =========================================================================
-- Test 2: Invitee customer has 'invitee-tag' after claim
-- =========================================================================
SELECT ok(
  EXISTS(
    SELECT 1 FROM grida_ciam.customer_tag
    WHERE customer_uid = current_setting('test.invitee_customer_uid')::uuid
      AND project_id = current_setting('test.project_id')::bigint
      AND tag_name = 'invitee-tag'
  ),
  'invitee customer should have invitee-tag after claiming'
);

-- =========================================================================
-- Test 3: Invitee customer has 'campaign-member' after claim
-- =========================================================================
SELECT ok(
  EXISTS(
    SELECT 1 FROM grida_ciam.customer_tag
    WHERE customer_uid = current_setting('test.invitee_customer_uid')::uuid
      AND project_id = current_setting('test.project_id')::bigint
      AND tag_name = 'campaign-member'
  ),
  'invitee customer should have campaign-member tag after claiming'
);

-- =========================================================================
-- Test 4: 'invitee-tag' was auto-created in public.tag
-- =========================================================================
SELECT ok(
  EXISTS(
    SELECT 1 FROM public.tag
    WHERE project_id = current_setting('test.project_id')::bigint
      AND name = 'invitee-tag'
  ),
  'invitee-tag should be auto-created in public.tag on claim'
);

-- =========================================================================
-- Test 5: 'campaign-member' was auto-created in public.tag
-- =========================================================================
SELECT ok(
  EXISTS(
    SELECT 1 FROM public.tag
    WHERE project_id = current_setting('test.project_id')::bigint
      AND name = 'campaign-member'
  ),
  'campaign-member tag should be auto-created in public.tag on claim'
);


SELECT * FROM finish();
ROLLBACK;
