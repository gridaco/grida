-- GRIDA-EE: billing
-- Billing RPCs run only through the server's service_role client. Member
-- reads use the existing RLS-protected views. PUBLIC revocation alone does
-- not remove anon/authenticated grants inherited from public-schema defaults.

BEGIN;

REVOKE ALL ON FUNCTION
  public.fn_billing_apply_metronome_event(text, text, jsonb),
  public.fn_billing_apply_stripe_event(text, text, jsonb),
  public.fn_billing_attach_stripe_customer(bigint, text),
  public.fn_billing_debit_balance_cache(bigint, bigint, bigint),
  public.fn_billing_get_active_subscription(bigint),
  public.fn_billing_get_ai_credit_processed(text),
  public.fn_billing_get_catalogue(text),
  public.fn_billing_get_customer_id(bigint),
  public.fn_billing_get_metronome_account(bigint),
  public.fn_billing_list_metronome_events(bigint, integer),
  public.fn_billing_list_provisioned_orgs(),
  public.fn_billing_resolve_org_by_metronome_customer(text),
  public.fn_billing_set_auto_reload(bigint, boolean, integer, integer),
  public.fn_billing_set_balance_cache(bigint, bigint, boolean),
  public.fn_billing_set_metronome_ids(bigint, text, text),
  public.fn_billing_setup_product(text, text, text),
  public.fn_billing_stamp_ai_credit_processed(text, text),
  public.fn_billing_stamp_failure(text, text, text)
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION
  public.fn_billing_apply_metronome_event(text, text, jsonb),
  public.fn_billing_apply_stripe_event(text, text, jsonb),
  public.fn_billing_attach_stripe_customer(bigint, text),
  public.fn_billing_debit_balance_cache(bigint, bigint, bigint),
  public.fn_billing_get_active_subscription(bigint),
  public.fn_billing_get_ai_credit_processed(text),
  public.fn_billing_get_catalogue(text),
  public.fn_billing_get_customer_id(bigint),
  public.fn_billing_get_metronome_account(bigint),
  public.fn_billing_list_metronome_events(bigint, integer),
  public.fn_billing_list_provisioned_orgs(),
  public.fn_billing_resolve_org_by_metronome_customer(text),
  public.fn_billing_set_auto_reload(bigint, boolean, integer, integer),
  public.fn_billing_set_balance_cache(bigint, bigint, boolean),
  public.fn_billing_set_metronome_ids(bigint, text, text),
  public.fn_billing_setup_product(text, text, text),
  public.fn_billing_stamp_ai_credit_processed(text, text),
  public.fn_billing_stamp_failure(text, text, text)
TO service_role;

COMMIT;
