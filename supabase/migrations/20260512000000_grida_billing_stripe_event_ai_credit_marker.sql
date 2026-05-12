-- AI credit post-processor marker for grida_billing.stripe_event.
--
-- Background — the Stripe webhook receiver runs the projector RPC
-- (`fn_billing_apply_stripe_event`) FIRST, which inserts into
-- `grida_billing.stripe_event` and stamps `processed_at`. THEN it runs the
-- AI-credit Checkout post-processor (`handleAiCreditCheckoutCompleted`),
-- which makes HTTP calls to Metronome (`addStripeChargedCommit`,
-- `setAutoReload`). If the post-processor 500s, Stripe retries the webhook,
-- but the projector returns `replayed` (event already processed) and the
-- receiver short-circuits BEFORE the AI-credit branch — so the Metronome
-- commit never lands. Customer paid; no balance.
--
-- The post-processor cannot fold into the SQL projector because it makes
-- network calls to Metronome. So we add a per-event marker the receiver
-- consults independently of the projector's `processed_at`: even on
-- replays, if `ai_credit_processed_at IS NULL` for a relevant event type,
-- the receiver re-runs the post-processor.
--
-- The column is set by the TS receiver (service_role, via the
-- `fn_billing_stamp_ai_credit_processed` wrapper) after the post-processor
-- returns successfully. NULL means "not yet processed (or not applicable)"
-- — the receiver decides which based on event type.

BEGIN;

ALTER TABLE grida_billing.stripe_event
  ADD COLUMN IF NOT EXISTS ai_credit_processed_at timestamptz;

COMMENT ON COLUMN grida_billing.stripe_event.ai_credit_processed_at IS
  'Set by the webhook receiver after the AI-credit post-processor '
  '(handleAiCreditCheckoutCompleted) successfully lands the Metronome '
  'commit + auto-reload config for an event. NULL means either (a) the '
  'post-processor has not yet succeeded for this event, or (b) the event '
  'is not a checkout.session.completed and the receiver never touched the '
  'marker. The replay path consults this independently of '
  'stripe_event.processed_at: when the projector returns ''replayed'' but '
  'this is NULL, the receiver re-invokes the post-processor so a Stripe '
  'retry can recover from a previous post-processor failure.';


-- ----------------------------------------------------------------------------
-- public.fn_billing_get_ai_credit_processed
--
-- Returns whether the AI-credit post-processor has marked this event done.
-- Returns NULL when no row exists yet (the projector either hasn't run or
-- failed before INSERT). The TS receiver treats NULL as "needs processing"
-- for the post-processor branch.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.fn_billing_get_ai_credit_processed(
  p_event_id text
)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT ai_credit_processed_at IS NOT NULL
    FROM grida_billing.stripe_event
   WHERE id = p_event_id;
$$;

REVOKE ALL ON FUNCTION public.fn_billing_get_ai_credit_processed(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_billing_get_ai_credit_processed(text) TO service_role;


-- ----------------------------------------------------------------------------
-- public.fn_billing_stamp_ai_credit_processed
--
-- UPSERT the marker (INSERT-then-UPDATE pattern matches fn_stamp_failure):
-- if the projector RAISEd and rolled back the stripe_event row before this
-- runs (shouldn't happen on the success path, but defensive), the INSERT
-- creates a forensic row tagged 'ai_credit_only'. On the normal path the
-- ON CONFLICT branch updates the existing row.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.fn_billing_stamp_ai_credit_processed(
  p_event_id   text,
  p_event_type text
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  INSERT INTO grida_billing.stripe_event (id, type, ai_credit_processed_at)
  VALUES (p_event_id, p_event_type, now())
  ON CONFLICT (id) DO UPDATE SET
    ai_credit_processed_at = EXCLUDED.ai_credit_processed_at;
$$;

REVOKE ALL ON FUNCTION public.fn_billing_stamp_ai_credit_processed(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_billing_stamp_ai_credit_processed(text, text) TO service_role;

COMMIT;
