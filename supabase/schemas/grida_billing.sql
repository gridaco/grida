-- grida_billing schema
--
-- Core billing primitives. Mirrors Stripe lifecycle objects (Customer,
-- Subscription, Invoice events, Disputes) into our DB so the rest of
-- the product can react to billing changes without ever touching Stripe
-- directly.
--
-- The schema is locked down: only postgres owner and service_role can
-- reach grida_billing.* tables. PostgREST surface lives in public.*.
--
-- Stripe-sourced amounts are in CENTS (Stripe's smallest currency unit)
-- and stored as `*_cents` columns to keep the boundary explicit.
--
-- No jsonb storage; all forensic / state fields are typed columns.
-- Test/live mode isolation is operational (separate Supabase projects
-- + env keys), not encoded in the schema.

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

CREATE SCHEMA IF NOT EXISTS grida_billing;
ALTER SCHEMA grida_billing OWNER TO postgres;

-- Schema USAGE: authenticated needs it because security_invoker=true views
-- in `public` resolve `grida_billing.*` as the calling role. Granting USAGE
-- alone exposes nothing — table-level GRANTs (further down) decide what
-- authenticated can actually read. anon has no USAGE here at all; the
-- public views aren't granted to anon either, so anon never reaches in.
REVOKE ALL ON SCHEMA grida_billing FROM PUBLIC;
GRANT  USAGE ON SCHEMA grida_billing TO authenticated, service_role;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA grida_billing GRANT ALL ON TABLES    TO service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA grida_billing GRANT ALL ON ROUTINES  TO service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA grida_billing GRANT ALL ON SEQUENCES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA grida_billing REVOKE ALL ON TABLES    FROM authenticated, anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA grida_billing REVOKE ALL ON ROUTINES  FROM authenticated, anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA grida_billing REVOKE ALL ON SEQUENCES FROM authenticated, anon;


---------------------------------------------------------------------
-- [grida_billing.account]
-- One row per organization. Bridge to Stripe Customer.
---------------------------------------------------------------------

CREATE TABLE grida_billing.account (
  organization_id     bigint PRIMARY KEY REFERENCES public.organization(id) ON DELETE CASCADE,
  stripe_customer_id  text UNIQUE,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

-- Read access pattern: authenticated org members may SELECT their account
-- row through the SELECT grant + permissive policy below. Writes stay
-- service-role only (no INSERT/UPDATE/DELETE grant; no permissive policy
-- for those ops → RLS denies). anon has no grant at all and cannot reach
-- the table.
ALTER TABLE grida_billing.account ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE grida_billing.account FROM anon, authenticated;
GRANT  ALL    ON TABLE grida_billing.account TO   service_role;
GRANT  SELECT ON TABLE grida_billing.account TO   authenticated;
CREATE POLICY member_can_select ON grida_billing.account
  FOR SELECT TO authenticated
  USING (
    organization_id IN (
      SELECT om.organization_id FROM public.organization_member om
       WHERE om.user_id = (SELECT auth.uid())
    )
  );


---------------------------------------------------------------------
-- [grida_billing.subscription]
-- Stripe Subscription mirror. plan ∈ ('free','pro','team').
--
-- `is_free` distinguishes our local-only free row (no Stripe sub)
-- from a paid Stripe-backed row. For free rows: status='active',
-- stripe_subscription_id IS NULL. For paid rows: status mirrors
-- Stripe directly. Enforced by CHECK below.
---------------------------------------------------------------------

CREATE TABLE grida_billing.subscription (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id          bigint NOT NULL REFERENCES public.organization(id) ON DELETE CASCADE,
  plan                     text NOT NULL CHECK (plan IN ('free','pro','team')),
  is_free                  boolean NOT NULL DEFAULT false,
  status                   text NOT NULL CHECK (status IN (
    'active','trialing','past_due','canceled',
    'unpaid','paused','incomplete','incomplete_expired'
  )),
  quantity                 integer NOT NULL DEFAULT 1 CHECK (quantity >= 1),
  cancel_at_period_end     boolean NOT NULL DEFAULT false,
  current_period_start     timestamptz,
  current_period_end       timestamptz,
  stripe_subscription_id   text UNIQUE,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now(),

  -- is_free ↔ no Stripe subscription. Always.
  CONSTRAINT subscription_is_free_iff_no_stripe CHECK (
    is_free = (stripe_subscription_id IS NULL)
  ),
  -- Free rows are plan='free'; paid rows are plan IN ('pro','team').
  CONSTRAINT subscription_free_plan_consistency CHECK (
    (is_free AND plan = 'free') OR (NOT is_free AND plan IN ('pro','team'))
  )
);

CREATE UNIQUE INDEX subscription_one_active_per_org_idx
  ON grida_billing.subscription (organization_id)
  WHERE status <> 'canceled';
CREATE INDEX subscription_organization_id_idx
  ON grida_billing.subscription (organization_id);

-- Same pattern as account: members SELECT their org's row; writes are
-- webhook-projector / service-role only.
ALTER TABLE grida_billing.subscription ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE grida_billing.subscription FROM anon, authenticated;
GRANT  ALL    ON TABLE grida_billing.subscription TO   service_role;
GRANT  SELECT ON TABLE grida_billing.subscription TO   authenticated;
CREATE POLICY member_can_select ON grida_billing.subscription
  FOR SELECT TO authenticated
  USING (
    organization_id IN (
      SELECT om.organization_id FROM public.organization_member om
       WHERE om.user_id = (SELECT auth.uid())
    )
  );


---------------------------------------------------------------------
-- [grida_billing.product_catalogue]
-- Generic Stripe product/price linkage.
---------------------------------------------------------------------

CREATE TABLE grida_billing.product_catalogue (
  id                     text PRIMARY KEY,
  kind                   text NOT NULL CHECK (kind IN ('plan','addon','metered','seat')),
  surface                text NOT NULL DEFAULT '*' CHECK (surface IN ('editor','cors','*')),
  stripe_product_id      text,
  stripe_price_id        text,
  -- Unit price in cents for the billing period implied by the catalogue id
  -- (monthly for `plan.<x>`, yearly for `plan.<x>.annual`). Stripe is the
  -- runtime authority for what gets charged — this column is informational.
  unit_amount_cents      integer CHECK (unit_amount_cents IS NULL OR unit_amount_cents >= 0),
  created_at             timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT product_catalogue_plan_has_price CHECK (
    kind <> 'plan' OR unit_amount_cents IS NOT NULL
  )
);

CREATE INDEX product_catalogue_stripe_price_id_idx
  ON grida_billing.product_catalogue (stripe_price_id)
  WHERE stripe_price_id IS NOT NULL;

ALTER TABLE grida_billing.product_catalogue ENABLE ROW LEVEL SECURITY;
CREATE POLICY default_deny_authenticated ON grida_billing.product_catalogue AS RESTRICTIVE FOR ALL TO authenticated USING (false) WITH CHECK (false);
CREATE POLICY default_deny_anon          ON grida_billing.product_catalogue AS RESTRICTIVE FOR ALL TO anon          USING (false) WITH CHECK (false);
REVOKE ALL ON TABLE grida_billing.product_catalogue FROM anon, authenticated;
GRANT  ALL ON TABLE grida_billing.product_catalogue TO   service_role;

INSERT INTO grida_billing.product_catalogue (id, kind, unit_amount_cents) VALUES
  ('plan.free',         'plan',     0),
  ('plan.pro',          'plan',  2000),  -- $20 / mo
  ('plan.team',         'plan',  6000),  -- $60 / mo
  ('plan.pro.annual',   'plan', 19200),  -- $192 / yr (20% off $240)
  ('plan.team.annual',  'plan', 57600)   -- $576 / yr (20% off $720)
ON CONFLICT (id) DO NOTHING;


---------------------------------------------------------------------
-- [grida_billing.stripe_event]
-- Webhook idempotency / dedup.
---------------------------------------------------------------------

CREATE TABLE grida_billing.stripe_event (
  id              text PRIMARY KEY,
  type            text NOT NULL,
  received_at     timestamptz NOT NULL DEFAULT now(),
  processed_at    timestamptz,
  failed_at       timestamptz,
  failure_reason  text,
  handler         text
);

CREATE INDEX stripe_event_handler_idx
  ON grida_billing.stripe_event (handler)
  WHERE handler IS NOT NULL;

ALTER TABLE grida_billing.stripe_event ENABLE ROW LEVEL SECURITY;
CREATE POLICY default_deny_authenticated ON grida_billing.stripe_event AS RESTRICTIVE FOR ALL TO authenticated USING (false) WITH CHECK (false);
CREATE POLICY default_deny_anon          ON grida_billing.stripe_event AS RESTRICTIVE FOR ALL TO anon          USING (false) WITH CHECK (false);
REVOKE ALL ON TABLE grida_billing.stripe_event FROM anon, authenticated;
GRANT  ALL ON TABLE grida_billing.stripe_event TO   service_role;


---------------------------------------------------------------------
-- [grida_billing.audit]
-- Billing-scoped operations log. Typed columns; no jsonb.
--
-- user_id        = the actor (auth.uid() at call time, when known;
--                  NULL for system / cron / webhook).
-- member_user_id = the seat target (for seat_add / seat_remove).
--
-- Stripe-sourced amounts (e.g. invoice.amount_paid) are in CENTS
-- and stored in amount_cents.
---------------------------------------------------------------------

CREATE TABLE grida_billing.audit (
  id                      bigserial PRIMARY KEY,
  organization_id         bigint NOT NULL REFERENCES public.organization(id) ON DELETE CASCADE,
  user_id                 uuid,
  operation               text NOT NULL CHECK (operation IN (
    'subscribe','cancel','seat_add','seat_remove',
    'customer_attach','webhook.received'
  )),

  -- Stripe references.
  stripe_event_id           text,
  stripe_subscription_id    text,
  stripe_invoice_id         text,
  stripe_customer_id        text,

  -- Seat operations.
  member_user_id          uuid,
  prev_quantity           integer,
  new_quantity            integer,

  -- State transitions.
  plan                    text,
  status                  text,

  -- Webhook context.
  event_type              text,
  billing_reason          text,
  attempt_count           integer,

  -- Stripe-sourced amount (cents).
  amount_cents            bigint,

  -- Free-form operator note.
  note                    text,

  created_at              timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX audit_org_created_idx
  ON grida_billing.audit (organization_id, created_at DESC);
CREATE INDEX audit_stripe_event_id_idx
  ON grida_billing.audit (stripe_event_id)
  WHERE stripe_event_id IS NOT NULL;
CREATE INDEX audit_stripe_invoice_id_idx
  ON grida_billing.audit (stripe_invoice_id)
  WHERE stripe_invoice_id IS NOT NULL;

-- Owner-only read: only the org owner sees audit rows (TC-BILLING-OPS-009/010).
-- Members other than the owner are excluded by the policy USING clause.
-- Writes stay webhook-projector only.
ALTER TABLE grida_billing.audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE grida_billing.audit FROM anon, authenticated;
GRANT  ALL    ON TABLE grida_billing.audit TO   service_role;
GRANT  SELECT ON TABLE grida_billing.audit TO   authenticated;
CREATE POLICY owner_can_select ON grida_billing.audit
  FOR SELECT TO authenticated
  USING (
    organization_id IN (
      SELECT o.id FROM public.organization o
       WHERE o.owner_id = (SELECT auth.uid())
    )
  );


-- ============================================================================
-- Functions
-- ============================================================================

---------------------------------------------------------------------
-- [grida_billing.fn_provision_account]
-- Idempotent. Creates account + free subscription rows.
---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION grida_billing.fn_provision_account(p_org_id bigint)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  INSERT INTO grida_billing.account (organization_id)
  VALUES (p_org_id)
  ON CONFLICT (organization_id) DO NOTHING;

  INSERT INTO grida_billing.subscription (
    organization_id, plan, is_free, status, quantity
  ) VALUES (
    p_org_id, 'free', true, 'active', 1
  )
  ON CONFLICT DO NOTHING;
END;
$$;


---------------------------------------------------------------------
-- [grida_billing.tg_provision_on_org_insert]
---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION grida_billing.tg_provision_on_org_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  PERFORM grida_billing.fn_provision_account(NEW.id);
  RETURN NEW;
END;
$$;

CREATE TRIGGER tg_billing_provision_on_org_insert
  AFTER INSERT ON public.organization
  FOR EACH ROW EXECUTE FUNCTION grida_billing.tg_provision_on_org_insert();


---------------------------------------------------------------------
-- [grida_billing.tg_organization_before_delete]
-- Refuse to delete an organization with an active Stripe-backed
-- subscription. CASCADE removes our local rows but does NOT cancel
-- the Stripe subscription — the customer would keep getting billed
-- forever for a service we can't deliver. (TC-BILLING-SUB-017)
--
-- TS deletion path must:
--   1. Cancel the Stripe subscription (Customer Portal or admin SDK).
--   2. Wait for customer.subscription.deleted webhook → status='canceled'.
--   3. THEN delete the organization row.
--
-- For free orgs with no Stripe sub, deletion proceeds normally.
---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION grida_billing.tg_organization_before_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_active_sub_id text;
BEGIN
  SELECT stripe_subscription_id INTO v_active_sub_id
    FROM grida_billing.subscription
   WHERE organization_id = OLD.id
     AND is_free = false
     AND status NOT IN ('canceled')
   LIMIT 1;

  IF v_active_sub_id IS NOT NULL THEN
    RAISE EXCEPTION
      'cannot delete organization %: active Stripe subscription % must be canceled first',
      OLD.id, v_active_sub_id
      USING ERRCODE = 'foreign_key_violation',
            HINT    = 'Cancel via Stripe Customer Portal, await customer.subscription.deleted webhook, then retry.';
  END IF;

  RETURN OLD;
END;
$$;

CREATE TRIGGER tg_billing_organization_before_delete
  BEFORE DELETE ON public.organization
  FOR EACH ROW EXECUTE FUNCTION grida_billing.tg_organization_before_delete();


---------------------------------------------------------------------
-- [grida_billing.fn_attach_stripe_customer]
-- Idempotent, race-safe attach.
---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION grida_billing.fn_attach_stripe_customer(
  p_org_id              bigint,
  p_stripe_customer_id  text
)
RETURNS TABLE (
  attached            boolean,
  stripe_customer_id  text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_existing  text;
  v_attached  boolean := false;
BEGIN
  SELECT acc.stripe_customer_id INTO v_existing
    FROM grida_billing.account acc
   WHERE acc.organization_id = p_org_id
   FOR UPDATE;

  -- The account row is provisioned by `tg_billing_provision_on_org_insert`.
  -- Its absence means either the trigger didn't fire (data inconsistency) or
  -- p_org_id is bogus — either way, refuse to silently report "attached".
  IF NOT FOUND THEN
    RAISE EXCEPTION
      'billing account not provisioned for organization %', p_org_id;
  END IF;

  IF v_existing IS NULL THEN
    UPDATE grida_billing.account
       SET stripe_customer_id = p_stripe_customer_id,
           updated_at         = now()
     WHERE organization_id = p_org_id;
    v_existing := p_stripe_customer_id;
    v_attached := true;

    INSERT INTO grida_billing.audit (organization_id, operation, stripe_customer_id)
    VALUES (p_org_id, 'customer_attach', p_stripe_customer_id);
  ELSIF v_existing <> p_stripe_customer_id THEN
    -- Fail closed on attach-time drift. Mismatched ids = ops contamination
    -- (manual SQL, leaked fixtures, double-create races). Silent skip would
    -- return the existing id and the caller's freshly-created Stripe
    -- customer would orphan on Stripe's side. Surface the conflict so
    -- whoever is calling can investigate.
    RAISE EXCEPTION
      'organization % is already attached to Stripe customer %, refusing %',
      p_org_id, v_existing, p_stripe_customer_id;
  END IF;

  RETURN QUERY SELECT v_attached, v_existing;
END;
$$;


-- Seat-sync triggers intentionally absent in v1.
-- Multi-seat billing is deferred: paid subs are billed at the quantity
-- chosen at Checkout (default 1) and changed only via the webhook.
-- Membership changes do not mutate subscription.quantity. When seat
-- management lands, it'll go through a server action that calls Stripe
-- with an idempotency key — never a local-mirror trigger.


---------------------------------------------------------------------
-- [grida_billing.fn_apply_stripe_event]
-- Webhook projector for SaaS billing events:
--   • customer.created / customer.updated → upsert account.stripe_customer_id
--   • customer.subscription.{created,updated,deleted} → upsert subscription
--     (cancels the free sentinel row first if present)
--   • invoice.payment_failed → set status='past_due'
--   • invoice.payment_succeeded → restore from past_due
--   • charge.dispute.{created,updated,closed} → suspend / restore /
--     cancel the subscription based on dispute lifecycle.
--
-- Idempotency: stripe_event.id PK + ON CONFLICT DO NOTHING. Replays
-- return result='replayed'; first-fail/retry path falls through.
-- On exception the function RAISEs; the receiver stamps failed_at
-- via fn_stamp_failure in a separate transaction.
---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION grida_billing.fn_apply_stripe_event(
  p_event_id    text,
  p_event_type  text,
  p_payload     jsonb
)
RETURNS TABLE (
  result   text,
  handler  text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_existing       grida_billing.stripe_event%ROWTYPE;
  v_handler        text;
  v_org_id         bigint;
  v_customer_id    text;
  v_sub_id         text;
  v_invoice_id     text;
  v_status         text;
  v_quantity       integer;
  v_cancel_at_pe   boolean;
  v_cancel_at_unix bigint;
  v_period_start   timestamptz;
  v_period_end     timestamptz;
  v_first_item     jsonb;
  v_price_id       text;
  v_plan           text;
  v_billing_reason text;
  v_amount_paid    bigint;
  v_attempt_count  integer;
BEGIN
  IF p_event_id IS NULL OR p_event_type IS NULL THEN
    RAISE EXCEPTION 'fn_apply_stripe_event: missing required argument';
  END IF;

  -- Idempotency. Insert-or-noop, then SELECT FOR UPDATE so concurrent
  -- deliveries of the same event id serialise here: the second one waits for
  -- the first to commit, then sees `processed_at` set and short-circuits.
  -- Without the row lock both could read processed_at IS NULL and re-project.
  INSERT INTO grida_billing.stripe_event (id, type)
  VALUES (p_event_id, p_event_type)
  ON CONFLICT (id) DO NOTHING;

  SELECT * INTO v_existing
    FROM grida_billing.stripe_event
   WHERE id = p_event_id
   FOR UPDATE;
  IF v_existing.processed_at IS NOT NULL THEN
    RETURN QUERY SELECT 'replayed'::text, v_existing.handler;
    RETURN;
  END IF;

  IF p_event_type IN ('customer.created','customer.updated') THEN
    v_customer_id := p_payload->>'id';
    v_org_id := nullif(p_payload->'metadata'->>'grida_organization_id', '')::bigint;

    IF v_org_id IS NOT NULL THEN
      -- Fail closed on stripe_customer_id drift: if the org is already
      -- attached to a *different* customer, refuse rather than silently
      -- no-oping. Mismatched ids almost always mean ops contamination
      -- (manual SQL, leaked test data) and silent skip turns later
      -- subscription events into ghosts. Stripe will retry the webhook
      -- while ops fixes the binding.
      DECLARE
        v_existing_cust text;
      BEGIN
        SELECT stripe_customer_id INTO v_existing_cust
          FROM grida_billing.account
         WHERE organization_id = v_org_id;
        IF FOUND
           AND v_existing_cust IS NOT NULL
           AND v_existing_cust <> v_customer_id THEN
          RAISE EXCEPTION
            'organization % already attached to Stripe customer %, refusing webhook for customer %',
            v_org_id, v_existing_cust, v_customer_id;
        END IF;
      END;

      UPDATE grida_billing.account
         SET stripe_customer_id = v_customer_id,
             updated_at         = now()
       WHERE organization_id = v_org_id
         AND (stripe_customer_id IS NULL OR stripe_customer_id = v_customer_id);

      INSERT INTO grida_billing.audit (
        organization_id, operation, stripe_event_id, stripe_customer_id, event_type
      ) VALUES (
        v_org_id, 'webhook.received', p_event_id, v_customer_id, p_event_type
      );
    END IF;
    v_handler := 'customer_upsert';

  ELSIF p_event_type IN (
    'customer.subscription.created',
    'customer.subscription.updated',
    'customer.subscription.deleted'
  ) THEN
    v_sub_id := p_payload->>'id';
    v_customer_id := CASE
      WHEN jsonb_typeof(p_payload->'customer') = 'string'
        THEN trim(both '"' from (p_payload->'customer')::text)
      ELSE p_payload->'customer'->>'id'
    END;

    SELECT organization_id INTO v_org_id
      FROM grida_billing.account
     WHERE stripe_customer_id = v_customer_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'subscription event % cannot be projected: no account for customer %', v_sub_id, v_customer_id;
    END IF;

    v_status     := p_payload->>'status';
    v_first_item := p_payload->'items'->'data'->0;
    v_quantity   := coalesce((v_first_item->>'quantity')::integer, 1);

    v_cancel_at_pe   := coalesce((p_payload->>'cancel_at_period_end')::boolean, false);
    v_cancel_at_unix := nullif(p_payload->>'cancel_at', '')::bigint;
    IF NOT v_cancel_at_pe AND v_cancel_at_unix IS NOT NULL
       AND to_timestamp(v_cancel_at_unix) > now() THEN
      v_cancel_at_pe := true;
    END IF;

    v_period_start := to_timestamp(nullif(v_first_item->>'current_period_start','')::bigint);
    v_period_end   := to_timestamp(nullif(v_first_item->>'current_period_end',  '')::bigint);
    v_price_id     := v_first_item->'price'->>'id';

    -- Map Stripe price → plan via the catalogue. Fail closed: an unknown or
    -- newly-provisioned price must not silently project as 'pro' (would
    -- mis-entitle the org). RAISE so Stripe retries while ops fixes the
    -- catalogue mapping.
    v_plan := NULL;
    IF v_price_id IS NOT NULL THEN
      SELECT CASE
               WHEN id IN ('plan.team', 'plan.team.annual') THEN 'team'
               WHEN id IN ('plan.pro',  'plan.pro.annual')  THEN 'pro'
               ELSE NULL
             END
        INTO v_plan
        FROM grida_billing.product_catalogue
       WHERE stripe_price_id = v_price_id;
    END IF;
    IF v_plan IS NULL THEN
      RAISE EXCEPTION
        'subscription % has unknown stripe price % — add it to grida_billing.product_catalogue',
        v_sub_id, v_price_id;
    END IF;

    -- Cancel the free sentinel row before the upsert (resolves
    -- "one active per org" partial unique).
    UPDATE grida_billing.subscription
       SET status = 'canceled', updated_at = now()
     WHERE organization_id = v_org_id
       AND is_free = true
       AND status <> 'canceled';

    INSERT INTO grida_billing.subscription (
      organization_id, plan, is_free, status, quantity,
      cancel_at_period_end, current_period_start, current_period_end,
      stripe_subscription_id
    ) VALUES (
      v_org_id, v_plan, false, v_status, v_quantity,
      v_cancel_at_pe, v_period_start, v_period_end, v_sub_id
    )
    ON CONFLICT (stripe_subscription_id) DO UPDATE SET
      organization_id      = EXCLUDED.organization_id,
      plan                 = EXCLUDED.plan,
      status               = EXCLUDED.status,
      quantity             = EXCLUDED.quantity,
      cancel_at_period_end = EXCLUDED.cancel_at_period_end,
      current_period_start = EXCLUDED.current_period_start,
      current_period_end   = EXCLUDED.current_period_end,
      updated_at           = now();

    INSERT INTO grida_billing.audit (
      organization_id, operation, stripe_event_id, stripe_subscription_id,
      event_type, plan, status, new_quantity
    ) VALUES (
      v_org_id, 'webhook.received', p_event_id, v_sub_id,
      p_event_type, v_plan, v_status, v_quantity
    );
    v_handler := 'subscription_upsert';

  ELSIF p_event_type IN ('charge.dispute.created','charge.dispute.closed','charge.dispute.updated') THEN
    -- Dispute payloads don't carry subscription_id natively. The
    -- TS receiver pre-resolves dispute.charge → invoice.subscription
    -- and stitches it into metadata.grida_subscription_id before
    -- invoking this RPC. Without it we cannot project; raise.
    v_sub_id := nullif(p_payload->'metadata'->>'grida_subscription_id', '');
    DECLARE
      v_dispute_status text := p_payload->>'status';
      v_dispute_id     text := p_payload->>'id';
    BEGIN
      IF v_sub_id IS NULL THEN
        RAISE EXCEPTION 'charge.dispute event % missing metadata.grida_subscription_id (TS must pre-resolve)', v_dispute_id;
      END IF;

      SELECT organization_id INTO v_org_id
        FROM grida_billing.subscription
       WHERE stripe_subscription_id = v_sub_id;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'charge.dispute: no subscription row for %', v_sub_id;
      END IF;

      -- TC-BILLING-PAY-011: created → suspend AI immediately.
      -- TC-BILLING-PAY-012: closed.won → restore.
      -- TC-BILLING-PAY-013: closed.lost → cancel; AI hard-blocked.
      IF p_event_type = 'charge.dispute.created'
         OR (p_event_type IN ('charge.dispute.updated')
             AND v_dispute_status IN ('warning_needs_response','warning_under_review',
                                      'needs_response','under_review')) THEN
        UPDATE grida_billing.subscription
           SET status = 'paused', updated_at = now()
         WHERE stripe_subscription_id = v_sub_id
           AND status NOT IN ('canceled');
      ELSIF p_event_type = 'charge.dispute.closed'
            AND v_dispute_status IN ('won','warning_closed') THEN
        UPDATE grida_billing.subscription
           SET status = 'active', updated_at = now()
         WHERE stripe_subscription_id = v_sub_id
           AND status = 'paused';
      ELSIF p_event_type = 'charge.dispute.closed'
            AND v_dispute_status = 'lost' THEN
        UPDATE grida_billing.subscription
           SET status = 'canceled', updated_at = now()
         WHERE stripe_subscription_id = v_sub_id;
      END IF;

      INSERT INTO grida_billing.audit (
        organization_id, operation, stripe_event_id, stripe_subscription_id,
        event_type, status, note
      ) VALUES (
        v_org_id, 'webhook.received', p_event_id, v_sub_id,
        p_event_type,
        CASE
          WHEN p_event_type = 'charge.dispute.closed' AND v_dispute_status = 'won'  THEN 'active'
          WHEN p_event_type = 'charge.dispute.closed' AND v_dispute_status = 'lost' THEN 'canceled'
          ELSE 'paused'
        END,
        format('dispute_id=%s status=%s', v_dispute_id, v_dispute_status)
      );
      v_handler := 'dispute_' || coalesce(v_dispute_status, 'unknown');
    END;

  ELSIF p_event_type = 'invoice.payment_failed' THEN
    v_invoice_id    := p_payload->>'id';
    v_attempt_count := nullif(p_payload->>'attempt_count','')::integer;
    v_sub_id        := nullif(p_payload->>'subscription', '');
    IF v_sub_id IS NULL THEN
      v_sub_id := p_payload->'parent'->'subscription_details'->>'subscription';
    END IF;

    IF v_sub_id IS NULL THEN
      v_handler := 'invoice_payment_failed_skipped';
    ELSE
      SELECT organization_id INTO v_org_id
        FROM grida_billing.subscription
       WHERE stripe_subscription_id = v_sub_id;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'invoice.payment_failed: no subscription row for %', v_sub_id;
      END IF;

      -- First-invoice failures arrive while Stripe holds the sub in
      -- `incomplete` (then `incomplete_expired` after ~23h). Don't collapse
      -- those into `past_due` — that's the renewal-failure status, and the UI
      -- branches on the distinction.
      UPDATE grida_billing.subscription
         SET status = CASE
               WHEN status IN ('incomplete', 'incomplete_expired') THEN status
               ELSE 'past_due'
             END,
             updated_at = now()
       WHERE stripe_subscription_id = v_sub_id
       RETURNING status INTO v_status;

      INSERT INTO grida_billing.audit (
        organization_id, operation, stripe_event_id, stripe_subscription_id,
        stripe_invoice_id, event_type, status, attempt_count
      ) VALUES (
        v_org_id, 'webhook.received', p_event_id, v_sub_id,
        v_invoice_id, p_event_type, v_status, v_attempt_count
      );
      v_handler := 'invoice_payment_failed';
    END IF;

  ELSIF p_event_type = 'invoice.payment_succeeded' THEN
    v_invoice_id     := p_payload->>'id';
    v_billing_reason := p_payload->>'billing_reason';
    v_amount_paid    := nullif(p_payload->>'amount_paid', '')::bigint;
    v_sub_id         := nullif(p_payload->>'subscription', '');
    IF v_sub_id IS NULL THEN
      v_sub_id := p_payload->'parent'->'subscription_details'->>'subscription';
    END IF;

    IF v_sub_id IS NULL THEN
      v_handler := 'invoice_payment_succeeded_skipped';
    ELSE
      SELECT organization_id, plan INTO v_org_id, v_plan
        FROM grida_billing.subscription
       WHERE stripe_subscription_id = v_sub_id;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'invoice.payment_succeeded: no subscription row for %', v_sub_id;
      END IF;

      UPDATE grida_billing.subscription
         SET status = 'active', updated_at = now()
       WHERE stripe_subscription_id = v_sub_id
         AND status = 'past_due';

      INSERT INTO grida_billing.audit (
        organization_id, operation, stripe_event_id, stripe_subscription_id,
        stripe_invoice_id, event_type, billing_reason, amount_cents, plan
      ) VALUES (
        v_org_id, 'webhook.received', p_event_id, v_sub_id,
        v_invoice_id, p_event_type, v_billing_reason, v_amount_paid, v_plan
      );
      v_handler := 'invoice_payment_succeeded';
    END IF;

  ELSE
    v_handler := 'unhandled';
  END IF;

  UPDATE grida_billing.stripe_event
     SET processed_at   = now(),
         handler        = v_handler,
         failed_at      = NULL,
         failure_reason = NULL
   WHERE id = p_event_id;

  RETURN QUERY SELECT 'handled'::text, v_handler;
END;
$$;


---------------------------------------------------------------------
-- [grida_billing.fn_stamp_failure]
-- Forensic stamp called from the receiver's catch path AFTER
-- fn_apply_stripe_event has rolled back. Separate transaction.
--
-- UPSERT, not UPDATE: when the projector RAISEs, the entire transaction
-- (including the INSERT INTO stripe_event at the top of fn_apply_stripe_event)
-- rolls back. So on a first-time failure, no row exists yet and an
-- UPDATE-only stamp would silently match nothing. INSERT … ON CONFLICT
-- handles both cases — first failure inserts the forensic row; later
-- failures update the existing one.
---------------------------------------------------------------------

DROP FUNCTION IF EXISTS grida_billing.fn_stamp_failure(text, text);

CREATE OR REPLACE FUNCTION grida_billing.fn_stamp_failure(
  p_event_id   text,
  p_event_type text,
  p_reason     text
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  INSERT INTO grida_billing.stripe_event (id, type, failed_at, failure_reason)
  VALUES (p_event_id, p_event_type, now(), left(p_reason, 2000))
  ON CONFLICT (id) DO UPDATE SET
    failed_at      = EXCLUDED.failed_at,
    failure_reason = EXCLUDED.failure_reason;
$$;


-- ============================================================================
-- public.* wrapper surface (PostgREST)
-- ============================================================================

---------------------------------------------------------------------
-- [public.v_billing_subscription]
--
-- security_invoker = true: the view runs as the caller, so RLS on the
-- base tables (grida_billing.subscription / .account) does the row
-- filtering. The view body keeps only the business filter
-- (status <> 'canceled') — auth-side scoping is done by the table-level
-- `member_can_select` policies. This satisfies splinter lint 0010.
---------------------------------------------------------------------

CREATE OR REPLACE VIEW public.v_billing_subscription
WITH (security_invoker = true)
AS
SELECT
  s.organization_id,
  s.plan,
  s.is_free,
  s.status,
  s.quantity,
  s.cancel_at_period_end,
  s.current_period_start,
  s.current_period_end,
  s.stripe_subscription_id,
  acc.stripe_customer_id
FROM grida_billing.subscription s
LEFT JOIN grida_billing.account acc ON acc.organization_id = s.organization_id
WHERE s.status <> 'canceled';

-- REVOKE before GRANT: Supabase's default privileges on `public` grant ALL
-- to anon/authenticated/service_role on new objects. Strip first, then add
-- back only the roles that should actually see the view.
REVOKE ALL    ON public.v_billing_subscription FROM PUBLIC, anon, authenticated;
GRANT  SELECT ON public.v_billing_subscription TO   authenticated, service_role;


---------------------------------------------------------------------
-- [public.v_billing_audit]
-- Owner-only billing audit feed (TC-BILLING-OPS-009/010).
-- Members can NOT read this — only the org owner.
---------------------------------------------------------------------

CREATE OR REPLACE VIEW public.v_billing_audit
WITH (security_invoker = true)
AS
SELECT
  a.id,
  a.organization_id,
  a.user_id,
  a.operation,
  a.stripe_event_id,
  a.stripe_subscription_id,
  a.stripe_invoice_id,
  a.stripe_customer_id,
  a.member_user_id,
  a.prev_quantity,
  a.new_quantity,
  a.plan,
  a.status,
  a.event_type,
  a.billing_reason,
  a.attempt_count,
  a.amount_cents,
  a.note,
  a.created_at
FROM grida_billing.audit a;
-- Owner-only filter is enforced by the `owner_can_select` RLS policy on
-- grida_billing.audit (security_invoker = true means RLS runs as caller).

REVOKE ALL    ON public.v_billing_audit FROM PUBLIC, anon, authenticated;
GRANT  SELECT ON public.v_billing_audit TO   authenticated, service_role;


---------------------------------------------------------------------
-- [public.fn_billing_apply_stripe_event]
---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.fn_billing_apply_stripe_event(
  p_event_id   text,
  p_event_type text,
  p_payload    jsonb
)
RETURNS TABLE (result text, handler text)
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT * FROM grida_billing.fn_apply_stripe_event(p_event_id, p_event_type, p_payload);
$$;

REVOKE ALL ON FUNCTION public.fn_billing_apply_stripe_event(text, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_billing_apply_stripe_event(text, text, jsonb) TO service_role;


---------------------------------------------------------------------
-- [public.fn_billing_stamp_failure]
---------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.fn_billing_stamp_failure(text, text);

CREATE OR REPLACE FUNCTION public.fn_billing_stamp_failure(
  p_event_id   text,
  p_event_type text,
  p_reason     text
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT grida_billing.fn_stamp_failure(p_event_id, p_event_type, p_reason);
$$;

REVOKE ALL ON FUNCTION public.fn_billing_stamp_failure(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_billing_stamp_failure(text, text, text) TO service_role;


---------------------------------------------------------------------
-- [public.fn_billing_attach_stripe_customer]
---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.fn_billing_attach_stripe_customer(
  p_org_id              bigint,
  p_stripe_customer_id  text
)
RETURNS TABLE (attached boolean, stripe_customer_id text)
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT * FROM grida_billing.fn_attach_stripe_customer(p_org_id, p_stripe_customer_id);
$$;

REVOKE ALL ON FUNCTION public.fn_billing_attach_stripe_customer(bigint, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_billing_attach_stripe_customer(bigint, text) TO service_role;


---------------------------------------------------------------------
-- [public.fn_billing_get_customer_id]
-- Service-role read of account.stripe_customer_id. Used by TS checkout
-- helpers (lib/billing/checkout.ts) to look up the cached customer id.
---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.fn_billing_get_customer_id(p_org_id bigint)
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT stripe_customer_id FROM grida_billing.account WHERE organization_id = p_org_id;
$$;

REVOKE ALL ON FUNCTION public.fn_billing_get_customer_id(bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_billing_get_customer_id(bigint) TO service_role;


---------------------------------------------------------------------
-- [public.fn_billing_get_active_subscription]
-- Service-role read of the org's active Stripe subscription. Returns
-- empty when the org is on the free sentinel row.
---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.fn_billing_get_active_subscription(p_org_id bigint)
RETURNS TABLE (
  stripe_subscription_id text,
  status                 text,
  quantity               integer,
  plan                   text,
  cancel_at_period_end   boolean,
  current_period_start   timestamptz,
  current_period_end     timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT s.stripe_subscription_id, s.status, s.quantity, s.plan,
         s.cancel_at_period_end, s.current_period_start, s.current_period_end
    FROM grida_billing.subscription s
   WHERE s.organization_id = p_org_id
     AND s.is_free = false
     AND s.status <> 'canceled'
   ORDER BY s.updated_at DESC
   LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.fn_billing_get_active_subscription(bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_billing_get_active_subscription(bigint) TO service_role;


---------------------------------------------------------------------
-- [public.fn_billing_get_catalogue]
-- Service-role read of product_catalogue.stripe_product_id +
-- stripe_price_id. Returns NULL row when the catalogue id is unknown
-- or has no Stripe wiring yet.
---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.fn_billing_get_catalogue(p_id text)
RETURNS TABLE (
  stripe_product_id text,
  stripe_price_id   text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT stripe_product_id, stripe_price_id
    FROM grida_billing.product_catalogue
   WHERE id = p_id;
$$;

REVOKE ALL ON FUNCTION public.fn_billing_get_catalogue(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_billing_get_catalogue(text) TO service_role;


---------------------------------------------------------------------
-- [public.fn_billing_setup_product]
---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.fn_billing_setup_product(
  p_grida_billing_id  text,
  p_stripe_product_id text,
  p_stripe_price_id   text
)
RETURNS TABLE (id text, stripe_product_id text, stripe_price_id text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF p_grida_billing_id NOT IN (
    'plan.pro', 'plan.team', 'plan.pro.annual', 'plan.team.annual'
  ) THEN
    RAISE EXCEPTION 'fn_billing_setup_product: unknown catalogue id %', p_grida_billing_id;
  END IF;

  UPDATE grida_billing.product_catalogue
     SET stripe_product_id = p_stripe_product_id,
         stripe_price_id   = p_stripe_price_id
   WHERE product_catalogue.id = p_grida_billing_id;

  RETURN QUERY SELECT p_grida_billing_id, p_stripe_product_id, p_stripe_price_id;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_billing_setup_product(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_billing_setup_product(text, text, text) TO service_role;
