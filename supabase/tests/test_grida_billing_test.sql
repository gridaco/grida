-- pgTAP suite: grida_billing schema
--
-- Covers: provisioning trigger, Stripe projector (subscription, invoice,
-- dispute, idempotency), org-delete guard, RLS on
-- public.v_billing_subscription / v_billing_audit.

BEGIN;

SELECT plan(37);

-- Stash seed UUIDs (regenerated on every `supabase db reset`).
DO $$
BEGIN
  PERFORM set_config('test.insider_uid',
    (SELECT id::text FROM auth.users WHERE email='insider@grida.co'), false);
  PERFORM set_config('test.alice_uid',
    (SELECT id::text FROM auth.users WHERE email='alice@acme.com'),   false);
  PERFORM set_config('test.random_uid',
    (SELECT id::text FROM auth.users WHERE email='random@example.com'), false);
END $$;

-- ---------------------------------------------------------------------
-- 1. Schema lockdown.
-- ---------------------------------------------------------------------

SELECT has_schema('grida_billing', 'grida_billing schema exists');
SELECT has_table('grida_billing', 'account', 'account table exists');
SELECT has_table('grida_billing', 'subscription', 'subscription table exists');
SELECT has_table('grida_billing', 'product_catalogue', 'product_catalogue exists');
SELECT has_table('grida_billing', 'stripe_event', 'stripe_event exists');
SELECT has_table('grida_billing', 'audit', 'audit exists');

-- ---------------------------------------------------------------------
-- 2. Auto-provision on org insert.
-- ---------------------------------------------------------------------

SELECT ok(
  exists(SELECT 1 FROM grida_billing.account WHERE organization_id = 1),
  'org 1 has billing.account row from trigger'
);
SELECT ok(
  exists(SELECT 1 FROM grida_billing.subscription
          WHERE organization_id = 1 AND is_free AND plan='free' AND status='active'),
  'org 1 has free/active subscription from trigger'
);

-- ---------------------------------------------------------------------
-- 3. Stripe projector: customer attach + subscription.created.
-- ---------------------------------------------------------------------

DO $$ BEGIN PERFORM public.fn_billing_attach_stripe_customer(1, 'cus_test_org1'); END $$;
-- Wire the test price id onto plan.pro so the fail-closed projector can map
-- it. Without this the subscription.created event below RAISEs with "unknown
-- stripe price" — see fn_apply_stripe_event.
DO $$ BEGIN PERFORM public.fn_billing_setup_product('plan.pro', 'prod_test_pro', 'price_pro_test'); END $$;

SELECT is(
  (SELECT stripe_customer_id FROM grida_billing.account WHERE organization_id=1),
  'cus_test_org1',
  'customer attach stamps account'
);

SELECT lives_ok($$
  SELECT public.fn_billing_apply_stripe_event(
    'evt_test_sub_created',
    'customer.subscription.created',
    jsonb_build_object(
      'id','sub_test1', 'status','active',
      'cancel_at_period_end', false,
      'customer','cus_test_org1',
      'items', jsonb_build_object('data', jsonb_build_array(
        jsonb_build_object(
          'quantity', 3,
          'current_period_start', extract(epoch from now())::bigint,
          'current_period_end',   extract(epoch from now() + interval '30 days')::bigint,
          'price', jsonb_build_object('id', 'price_pro_test')
        )
      ))
    )
  )
$$, 'subscription.created applies cleanly');

SELECT ok(
  exists(SELECT 1 FROM grida_billing.subscription
          WHERE stripe_subscription_id='sub_test1'
            AND organization_id=1 AND is_free=false
            AND quantity=3 AND status='active'),
  'paid subscription row inserted with qty=3'
);

SELECT ok(
  not exists(SELECT 1 FROM grida_billing.subscription
              WHERE organization_id=1 AND is_free=true AND status<>'canceled'),
  'free sentinel row was canceled by upgrade'
);

-- ---------------------------------------------------------------------
-- 4. Idempotency.
-- ---------------------------------------------------------------------

SELECT is(
  (SELECT result FROM public.fn_billing_apply_stripe_event(
    'evt_test_sub_created', 'customer.subscription.created',
    '{"id":"sub_test1","status":"active","customer":"cus_test_org1","items":{"data":[{"quantity":3,"price":{"id":"price_pro_test"}}]}}'::jsonb)),
  'replayed',
  'duplicate event_id returns replayed'
);

-- ---------------------------------------------------------------------
-- 5. invoice.payment_failed → past_due → payment_succeeded → active.
-- ---------------------------------------------------------------------

SELECT lives_ok($$
  SELECT public.fn_billing_apply_stripe_event(
    'evt_invoice_failed_1',
    'invoice.payment_failed',
    jsonb_build_object('id','in_test1','subscription','sub_test1','attempt_count',1)
  )
$$, 'invoice.payment_failed applies');

SELECT is(
  (SELECT status FROM grida_billing.subscription WHERE stripe_subscription_id='sub_test1'),
  'past_due',
  'subscription is past_due after payment_failed'
);

SELECT lives_ok($$
  SELECT public.fn_billing_apply_stripe_event(
    'evt_invoice_succeeded_1',
    'invoice.payment_succeeded',
    jsonb_build_object('id','in_test2','subscription','sub_test1','billing_reason','subscription_cycle','amount_paid', 6000)
  )
$$, 'invoice.payment_succeeded applies');

SELECT is(
  (SELECT status FROM grida_billing.subscription WHERE stripe_subscription_id='sub_test1'),
  'active',
  'subscription restored to active after payment_succeeded'
);

-- ---------------------------------------------------------------------
-- 5a. subscription.updated mirrors quantity changes.
-- ---------------------------------------------------------------------

SELECT lives_ok($$
  SELECT public.fn_billing_apply_stripe_event(
    'evt_test_sub_qty_change',
    'customer.subscription.updated',
    jsonb_build_object(
      'id','sub_test1', 'status','active',
      'cancel_at_period_end', false,
      'customer','cus_test_org1',
      'items', jsonb_build_object('data', jsonb_build_array(
        jsonb_build_object(
          'quantity', 5,
          'current_period_start', extract(epoch from now())::bigint,
          'current_period_end',   extract(epoch from now() + interval '30 days')::bigint,
          'price', jsonb_build_object('id', 'price_pro_test')
        )
      ))
    )
  )
$$, 'subscription.updated (qty change) applies');

SELECT is(
  (SELECT quantity FROM grida_billing.subscription WHERE stripe_subscription_id='sub_test1'),
  5,
  'subscription.updated mirrors new quantity (3 → 5)'
);

-- ---------------------------------------------------------------------
-- 5b. subscription.updated mirrors cancel_at_period_end toggle.
-- ---------------------------------------------------------------------

SELECT lives_ok($$
  SELECT public.fn_billing_apply_stripe_event(
    'evt_test_sub_cape',
    'customer.subscription.updated',
    jsonb_build_object(
      'id','sub_test1', 'status','active',
      'cancel_at_period_end', true,
      'customer','cus_test_org1',
      'items', jsonb_build_object('data', jsonb_build_array(
        jsonb_build_object(
          'quantity', 5,
          'current_period_start', extract(epoch from now())::bigint,
          'current_period_end',   extract(epoch from now() + interval '30 days')::bigint,
          'price', jsonb_build_object('id', 'price_pro_test')
        )
      ))
    )
  )
$$, 'subscription.updated (cancel_at_period_end) applies');

SELECT is(
  (SELECT cancel_at_period_end FROM grida_billing.subscription WHERE stripe_subscription_id='sub_test1'),
  true,
  'subscription.updated flips cancel_at_period_end → true'
);

-- Reset cape back to false so section 7's org-delete-guard test sees the
-- expected "active Stripe sub" state.
DO $$ BEGIN
  PERFORM public.fn_billing_apply_stripe_event(
    'evt_test_sub_cape_reset',
    'customer.subscription.updated',
    jsonb_build_object(
      'id','sub_test1', 'status','active',
      'cancel_at_period_end', false,
      'customer','cus_test_org1',
      'items', jsonb_build_object('data', jsonb_build_array(
        jsonb_build_object(
          'quantity', 5,
          'price', jsonb_build_object('id', 'price_pro_test')
        )
      ))
    )
  );
END $$;

-- ---------------------------------------------------------------------
-- 6. Dispute lifecycle.
-- ---------------------------------------------------------------------

SELECT lives_ok($$
  SELECT public.fn_billing_apply_stripe_event(
    'evt_dispute_created_1',
    'charge.dispute.created',
    jsonb_build_object(
      'id','dp_1','status','warning_under_review',
      'metadata', jsonb_build_object('grida_subscription_id','sub_test1')
    )
  )
$$, 'dispute.created applies');

SELECT is(
  (SELECT status FROM grida_billing.subscription WHERE stripe_subscription_id='sub_test1'),
  'paused',
  'dispute.created → paused'
);

SELECT lives_ok($$
  SELECT public.fn_billing_apply_stripe_event(
    'evt_dispute_won_1',
    'charge.dispute.closed',
    jsonb_build_object(
      'id','dp_1','status','won',
      'metadata', jsonb_build_object('grida_subscription_id','sub_test1')
    )
  )
$$, 'dispute.closed.won applies');

SELECT is(
  (SELECT status FROM grida_billing.subscription WHERE stripe_subscription_id='sub_test1'),
  'active',
  'dispute.closed.won → active'
);

SELECT throws_ok($$
  SELECT public.fn_billing_apply_stripe_event(
    'evt_dispute_unbound',
    'charge.dispute.created',
    '{"id":"dp_x","status":"under_review"}'::jsonb
  )
$$, NULL, NULL,
  'dispute event without grida_subscription_id raises'
);

-- ---------------------------------------------------------------------
-- 7. Org-delete guard.
-- ---------------------------------------------------------------------

SELECT throws_ok($$
  DELETE FROM public.organization WHERE id = 1
$$, NULL, NULL,
  'cannot delete org with active Stripe subscription');

UPDATE grida_billing.subscription
   SET status='canceled', updated_at=now()
 WHERE organization_id=1 AND is_free=false;

SELECT lives_ok($$
  DELETE FROM public.organization WHERE id = 1
$$, 'org deletes after Stripe sub canceled');

-- ---------------------------------------------------------------------
-- 9. RLS on v_billing_subscription. (Local org was deleted above, use acme.)
-- ---------------------------------------------------------------------

SET LOCAL ROLE authenticated;

SELECT set_config('request.jwt.claim.sub', current_setting('test.insider_uid'), true);
SELECT is(
  (SELECT count(*) FROM public.v_billing_subscription WHERE organization_id=2),
  0::bigint,
  'insider does NOT see acme subscription'
);

SELECT set_config('request.jwt.claim.sub', current_setting('test.alice_uid'), true);
SELECT ok(
  exists(SELECT 1 FROM public.v_billing_subscription WHERE organization_id=2),
  'alice sees own acme subscription'
);

SELECT set_config('request.jwt.claim.sub', current_setting('test.random_uid'), true);
SELECT is(
  (SELECT count(*) FROM public.v_billing_subscription),
  0::bigint,
  'random user with no org sees no subscriptions'
);
RESET ROLE;

-- ---------------------------------------------------------------------
-- 10. v_billing_audit owner-only (member-but-not-owner blocked).
-- ---------------------------------------------------------------------

INSERT INTO grida_billing.audit (organization_id, operation, note)
VALUES (2, 'customer_attach', 'pgtap fixture');

INSERT INTO public.organization_member (organization_id, user_id)
VALUES (2, current_setting('test.insider_uid')::uuid);

SET LOCAL ROLE authenticated;

SELECT set_config('request.jwt.claim.sub', current_setting('test.insider_uid'), true);
SELECT is(
  (SELECT count(*) FROM public.v_billing_audit WHERE organization_id=2),
  0::bigint,
  'member who is NOT owner cannot see acme audit'
);

SELECT set_config('request.jwt.claim.sub', current_setting('test.alice_uid'), true);
SELECT ok(
  (SELECT count(*) FROM public.v_billing_audit WHERE organization_id=2) > 0,
  'owner alice sees her acme audit rows'
);

RESET ROLE;

-- ---------------------------------------------------------------------
-- 11. Annual catalogue id resolves to the underlying plan.
--     `plan.pro.annual` → 'pro', `plan.team.annual` → 'team'.
--     Wire dummy stripe price ids onto the catalogue rows, deliver a
--     subscription.created event referencing each, and assert the projected
--     `subscription.plan` is correct (not the silent fallback).
-- ---------------------------------------------------------------------

DO $$ BEGIN PERFORM public.fn_billing_attach_stripe_customer(2, 'cus_test_org2_annual'); END $$;
DO $$ BEGIN PERFORM public.fn_billing_setup_product('plan.pro.annual', 'prod_test_pro_annual', 'price_test_pro_annual'); END $$;

SELECT lives_ok($$
  SELECT public.fn_billing_apply_stripe_event(
    'evt_test_sub_pro_annual',
    'customer.subscription.created',
    jsonb_build_object(
      'id','sub_test_pro_annual', 'status','active',
      'cancel_at_period_end', false,
      'customer','cus_test_org2_annual',
      'items', jsonb_build_object('data', jsonb_build_array(
        jsonb_build_object(
          'quantity', 1,
          'current_period_start', extract(epoch from now())::bigint,
          'current_period_end',   extract(epoch from now() + interval '365 days')::bigint,
          'price', jsonb_build_object('id', 'price_test_pro_annual')
        )
      ))
    )
  )
$$, 'subscription.created with annual price applies');

SELECT is(
  (SELECT plan FROM grida_billing.subscription WHERE stripe_subscription_id='sub_test_pro_annual'),
  'pro',
  'plan.pro.annual catalogue id resolves to plan=pro (no silent fallback)'
);

-- ---------------------------------------------------------------------
-- 12. is_enterprise column: default is false; service_role can flip it.
-- ---------------------------------------------------------------------

SELECT is(
  (SELECT is_enterprise FROM public.organization WHERE id = 2),
  false,
  'is_enterprise defaults to false on org insert'
);

UPDATE public.organization SET is_enterprise = true WHERE id = 2;

SELECT is(
  (SELECT is_enterprise FROM public.organization WHERE id = 2),
  true,
  'service_role can set is_enterprise = true'
);

SELECT * FROM finish();
ROLLBACK;
