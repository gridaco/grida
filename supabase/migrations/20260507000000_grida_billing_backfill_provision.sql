-- Backfill billing provisioning for orgs that pre-date 20260506132900.
--
-- The base migration adds an `AFTER INSERT` trigger that calls
-- `fn_provision_account` to create the `grida_billing.account` and free
-- `grida_billing.subscription` rows. The trigger only fires on NEW orgs;
-- pre-existing orgs were left without their billing rows. This blocks
-- their first checkout because `fn_attach_stripe_customer` (correctly)
-- refuses to attach a Stripe customer to a non-provisioned account.
--
-- Production hit this on org 255: "billing account not provisioned for
-- organization 255".
--
-- Iterate every existing org and call `fn_provision_account` (idempotent:
-- INSERT … ON CONFLICT DO NOTHING). The guard in fn_attach_stripe_customer
-- stays loud — once the data is right, that RAISE is the correct behavior
-- for any future anomaly (deleted row, bypassed trigger, partial restore).

DO $$
DECLARE
  rec RECORD;
  n   integer := 0;
BEGIN
  FOR rec IN SELECT id FROM public.organization LOOP
    PERFORM grida_billing.fn_provision_account(rec.id);
    n := n + 1;
  END LOOP;
  RAISE NOTICE 'grida_billing backfill: provisioned % organizations', n;
END $$;
