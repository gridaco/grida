-- AI credits — Metronome integration layer.
--
-- Adds on top of the base grida_billing schema (20260506132900):
--   1. `account.provisioning_uid` — namespaces external billing identities
--      so orphan cloud-side customers from prior `supabase db reset` runs
--      become inert.
--   2. `account.metronome_*` + entitlement / balance-cache / auto-reload
--      columns — the per-org state needed to gate AI calls and trigger
--      Metronome's threshold-recharge.
--   3. `metronome_event` dedup table — at-least-once webhook delivery.
--   4. `public.fn_billing_apply_metronome_event` — projector. Multi-tier
--      alert aware: only depletion-tier (threshold ≤ 0) flips entitlement;
--      warning tiers refresh balance only.
--   5. Service-role RPCs for the TS layer to read/write the row, look up
--      org by metronome_customer_id, list recent webhook events, and
--      atomically debit the balance cache after a successful ingest.
--
-- See docs/wg/platform/billing/ai-credits.md for the architectural rationale.

BEGIN;

-- ============================================================================
-- 1. account columns
-- ============================================================================

-- gen_random_uuid() lives in pgcrypto; standard on Supabase. Volatile, so PG
-- fills in a distinct UUID for every existing row at ALTER time. No backfill
-- needed.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE grida_billing.account
  ADD COLUMN IF NOT EXISTS provisioning_uid             uuid    NOT NULL DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS metronome_customer_id        text    UNIQUE,
  ADD COLUMN IF NOT EXISTS metronome_contract_id        text,
  ADD COLUMN IF NOT EXISTS customer_entitled            boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS cached_balance_cents         bigint  NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cached_balance_at            timestamptz,
  ADD COLUMN IF NOT EXISTS auto_reload_enabled          boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS auto_reload_threshold_cents  integer,
  ADD COLUMN IF NOT EXISTS auto_reload_amount_cents     integer;

COMMENT ON COLUMN grida_billing.account.provisioning_uid IS
  'Per-account UUID used to namespace identities in external billing '
  'systems (Metronome ingest_alias, etc). Non-deterministic by design — '
  'regenerated on every fresh row. Purpose: prevents silent reuse of '
  'orphan cloud-side customers across local DB resets. Stable for the '
  'lifetime of the row in production.';

COMMENT ON COLUMN grida_billing.account.metronome_customer_id IS
  'Metronome customer id linked to this org. Set once at first paid intent.';

COMMENT ON COLUMN grida_billing.account.metronome_contract_id IS
  'Metronome contract id. The contract holds commits and recurring credits.';

COMMENT ON COLUMN grida_billing.account.customer_entitled IS
  'Gate decision cache. True when AI calls are allowed. Flipped by webhook handlers.';

COMMENT ON COLUMN grida_billing.account.cached_balance_cents IS
  'Last-known credit balance from Metronome, in cents. Display + safety check.';

COMMENT ON COLUMN grida_billing.account.cached_balance_at IS
  'When cached_balance_cents was last refreshed. Stale readings trigger a sync.';

COMMENT ON COLUMN grida_billing.account.auto_reload_enabled IS
  'When true, Metronome auto-charges to refill balance once it drops below threshold.';


-- ============================================================================
-- 2. metronome_event — webhook dedup
-- ============================================================================

CREATE TABLE IF NOT EXISTS grida_billing.metronome_event (
  event_id       text        PRIMARY KEY,
  event_type     text        NOT NULL,
  received_at    timestamptz NOT NULL DEFAULT now(),
  processed_at   timestamptz,
  failure_reason text,
  payload        jsonb       NOT NULL
);

CREATE INDEX IF NOT EXISTS metronome_event_type_idx
  ON grida_billing.metronome_event (event_type, received_at DESC);

ALTER TABLE grida_billing.metronome_event ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE grida_billing.metronome_event FROM anon, authenticated;
GRANT  ALL ON TABLE grida_billing.metronome_event TO   service_role;

COMMENT ON TABLE grida_billing.metronome_event IS
  'Metronome webhook event log. PK on event_id is the dedup boundary.';


-- ============================================================================
-- 3. public.fn_billing_apply_metronome_event — projector
--
-- Same idiom as fn_billing_apply_stripe_event: SECURITY DEFINER, idempotent
-- on event_id. Returns ('processed' | 'replayed' | 'unhandled', handler).
--
-- Multi-tier-aware: a $50 warning alert mustn't block the user the same as
-- a $0 depletion alert. Reads threshold from the payload defensively (key
-- path varies by event type); missing → treat as depletion (safe default).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_billing_apply_metronome_event(
  p_event_id   text,
  p_event_type text,
  p_payload    jsonb
)
RETURNS TABLE (result text, handler text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_customer_id           text;
  v_org_id                bigint;
  v_existing_processed_at timestamptz;
  v_threshold             bigint;
  v_remaining             bigint;
  v_is_depletion          boolean;
BEGIN
  -- Insert event row; on conflict it's a replay.
  INSERT INTO grida_billing.metronome_event (event_id, event_type, payload)
  VALUES (p_event_id, p_event_type, p_payload)
  ON CONFLICT (event_id) DO NOTHING;

  SELECT processed_at INTO v_existing_processed_at
    FROM grida_billing.metronome_event
   WHERE event_id = p_event_id;

  IF v_existing_processed_at IS NOT NULL THEN
    RETURN QUERY SELECT 'replayed'::text, p_event_type::text;
    RETURN;
  END IF;

  -- Resolve the affected org by metronome_customer_id, when present.
  v_customer_id := p_payload->'properties'->>'customer_id';
  IF v_customer_id IS NOT NULL THEN
    SELECT a.organization_id INTO v_org_id
      FROM grida_billing.account a
     WHERE a.metronome_customer_id = v_customer_id;
  END IF;

  -- Dispatch.
  IF p_event_type = 'payment_gate.payment_status' THEN
    -- Successful Stripe charge → entitle the org.
    -- Failure → leave entitlement as-is (the previous balance still holds).
    IF v_org_id IS NOT NULL
       AND p_payload->'properties'->>'payment_status' = 'paid' THEN
      UPDATE grida_billing.account
         SET customer_entitled = true,
             updated_at        = now()
       WHERE organization_id   = v_org_id;
    END IF;
    RETURN QUERY SELECT 'processed'::text, 'payment_gate.payment_status'::text;

  ELSIF p_event_type LIKE 'alerts.%' AND p_event_type LIKE '%balance%reached' THEN
    IF v_org_id IS NOT NULL THEN
      v_threshold := COALESCE(
        NULLIF(p_payload->'properties'->'alert'->>'threshold', '')::bigint,
        NULLIF(p_payload->'properties'->>'threshold', '')::bigint,
        NULLIF(p_payload->>'threshold', '')::bigint
      );
      v_remaining := COALESCE(
        NULLIF(p_payload->'properties'->>'remaining_balance', '')::bigint,
        NULLIF(p_payload->'properties'->>'balance', '')::bigint
      );
      -- If we couldn't read threshold, treat as depletion (safe default).
      v_is_depletion := COALESCE(v_threshold, 0) <= 0;

      UPDATE grida_billing.account
         SET cached_balance_cents = COALESCE(v_remaining, cached_balance_cents),
             cached_balance_at    = now(),
             customer_entitled    = CASE
               WHEN v_is_depletion THEN false
               ELSE customer_entitled
             END,
             updated_at           = now()
       WHERE organization_id      = v_org_id;
    END IF;
    RETURN QUERY SELECT 'processed'::text, p_event_type::text;

  ELSIF p_event_type IN (
    'commit.create', 'commit.edit', 'commit.archive',
    'commit.segment.start', 'commit.segment.end',
    'credit.create', 'credit.edit', 'credit.archive',
    'credit.segment.start', 'credit.segment.end',
    'contract.start', 'contract.edit', 'contract.end'
  ) THEN
    -- Lifecycle event — no entitlement change. The TS layer handles
    -- balance cache refresh via direct Metronome read after these.
    RETURN QUERY SELECT 'processed'::text, 'lifecycle'::text;

  ELSIF p_event_type = 'webhooks.test' THEN
    RETURN QUERY SELECT 'processed'::text, 'webhooks.test'::text;

  ELSE
    RETURN QUERY SELECT 'unhandled'::text, p_event_type::text;
  END IF;

  -- Stamp processed_at on the row (only when we matched a handler).
  UPDATE grida_billing.metronome_event
     SET processed_at = now()
   WHERE event_id     = p_event_id;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_billing_apply_metronome_event(text, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_billing_apply_metronome_event(text, text, jsonb) TO service_role;


-- ============================================================================
-- 4. Service-role RPCs (TS layer reads/writes go through these — grida_billing
--    is intentionally not REST-exposed).
-- ============================================================================

-- Typed read of the account row.
CREATE OR REPLACE FUNCTION public.fn_billing_get_metronome_account(p_org bigint)
RETURNS TABLE (
  organization_id              bigint,
  stripe_customer_id           text,
  metronome_customer_id        text,
  metronome_contract_id        text,
  customer_entitled            boolean,
  cached_balance_cents         bigint,
  cached_balance_at            timestamptz,
  auto_reload_enabled          boolean,
  auto_reload_threshold_cents  integer,
  auto_reload_amount_cents     integer,
  provisioning_uid             uuid
)
LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, public
AS $$
  SELECT a.organization_id, a.stripe_customer_id, a.metronome_customer_id,
         a.metronome_contract_id, a.customer_entitled, a.cached_balance_cents,
         a.cached_balance_at, a.auto_reload_enabled,
         a.auto_reload_threshold_cents, a.auto_reload_amount_cents,
         a.provisioning_uid
    FROM grida_billing.account a
   WHERE a.organization_id = p_org;
$$;
REVOKE ALL ON FUNCTION public.fn_billing_get_metronome_account(bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_billing_get_metronome_account(bigint) TO service_role;


-- Link Metronome customer + contract to an org.
CREATE OR REPLACE FUNCTION public.fn_billing_set_metronome_ids(
  p_org bigint, p_customer_id text, p_contract_id text
)
RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, public
AS $$
  UPDATE grida_billing.account
     SET metronome_customer_id = p_customer_id,
         metronome_contract_id = p_contract_id,
         updated_at            = now()
   WHERE organization_id = p_org;
$$;
REVOKE ALL ON FUNCTION public.fn_billing_set_metronome_ids(bigint, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_billing_set_metronome_ids(bigint, text, text) TO service_role;


-- Refresh the gate-decision cache.
CREATE OR REPLACE FUNCTION public.fn_billing_set_balance_cache(
  p_org bigint, p_balance_cents bigint, p_entitled boolean
)
RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, public
AS $$
  UPDATE grida_billing.account
     SET cached_balance_cents = p_balance_cents,
         cached_balance_at    = now(),
         customer_entitled    = p_entitled,
         updated_at           = now()
   WHERE organization_id = p_org;
$$;
REVOKE ALL ON FUNCTION public.fn_billing_set_balance_cache(bigint, bigint, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_billing_set_balance_cache(bigint, bigint, boolean) TO service_role;


-- Toggle and configure auto-reload.
CREATE OR REPLACE FUNCTION public.fn_billing_set_auto_reload(
  p_org bigint, p_enabled boolean, p_threshold_cents integer, p_amount_cents integer
)
RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, public
AS $$
  UPDATE grida_billing.account
     SET auto_reload_enabled         = p_enabled,
         auto_reload_threshold_cents = p_threshold_cents,
         auto_reload_amount_cents    = p_amount_cents,
         updated_at                  = now()
   WHERE organization_id = p_org;
$$;
REVOKE ALL ON FUNCTION public.fn_billing_set_auto_reload(bigint, boolean, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_billing_set_auto_reload(bigint, boolean, integer, integer) TO service_role;


-- Lookup helper for the webhook receiver.
CREATE OR REPLACE FUNCTION public.fn_billing_resolve_org_by_metronome_customer(p_customer_id text)
RETURNS bigint
LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, public
AS $$
  SELECT a.organization_id
    FROM grida_billing.account a
   WHERE a.metronome_customer_id = p_customer_id
   LIMIT 1;
$$;
REVOKE ALL ON FUNCTION public.fn_billing_resolve_org_by_metronome_customer(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_billing_resolve_org_by_metronome_customer(text) TO service_role;


-- List orgs that are wired to a Metronome customer + contract. Used by the
-- hourly reconcile cron — sweeping only provisioned orgs avoids O(orgs)
-- Metronome calls/hour as the unprovisioned tail grows.
CREATE OR REPLACE FUNCTION public.fn_billing_list_provisioned_orgs()
RETURNS TABLE (organization_id bigint)
LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, public
AS $$
  SELECT a.organization_id
    FROM grida_billing.account a
   WHERE a.metronome_customer_id IS NOT NULL
     AND a.metronome_contract_id IS NOT NULL
   ORDER BY a.organization_id;
$$;
REVOKE ALL ON FUNCTION public.fn_billing_list_provisioned_orgs() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_billing_list_provisioned_orgs() TO service_role;


-- Recent webhook log for QA pages. Filtered by customer (resolves to org)
-- when provided.
CREATE OR REPLACE FUNCTION public.fn_billing_list_metronome_events(
  p_org bigint DEFAULT NULL, p_limit integer DEFAULT 20
)
RETURNS TABLE (
  event_id       text,
  event_type     text,
  received_at    timestamptz,
  processed_at   timestamptz,
  failure_reason text,
  customer_id    text,
  payment_status text
)
LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, public
AS $$
  SELECT e.event_id,
         e.event_type,
         e.received_at,
         e.processed_at,
         e.failure_reason,
         e.payload->'properties'->>'customer_id'    AS customer_id,
         e.payload->'properties'->>'payment_status' AS payment_status
    FROM grida_billing.metronome_event e
   WHERE p_org IS NULL OR EXISTS (
     SELECT 1 FROM grida_billing.account a
      WHERE a.organization_id      = p_org
        AND a.metronome_customer_id = e.payload->'properties'->>'customer_id'
   )
   ORDER BY e.received_at DESC
   LIMIT GREATEST(1, LEAST(p_limit, 200));
$$;
REVOKE ALL ON FUNCTION public.fn_billing_list_metronome_events(bigint, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_billing_list_metronome_events(bigint, integer) TO service_role;


-- ============================================================================
-- 5. Optimistic local debit RPC
--
-- The webhook only updates the cache on alert events; during steady-state
-- usage no webhook fires per-event, so the cache lies until the next
-- reconciliation. This RPC lets the ingest path debit the cache atomically
-- right after a successful Metronome ingest. Floors at 0; proactively flips
-- entitlement off when crossing the floor so the gate refuses without
-- waiting for the alerts.low_remaining_* webhook.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_billing_debit_balance_cache(
  p_org         bigint,
  p_cents       bigint,
  p_floor_cents bigint DEFAULT 25
)
RETURNS TABLE (cached_balance_cents bigint, customer_entitled boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public
AS $$
DECLARE
  v_new_balance bigint;
  v_entitled    boolean;
BEGIN
  IF p_cents < 0 THEN
    RAISE EXCEPTION 'p_cents must be non-negative (got %)', p_cents;
  END IF;

  UPDATE grida_billing.account a
     SET cached_balance_cents =
           GREATEST(0::bigint, a.cached_balance_cents - p_cents),
         customer_entitled = CASE
           WHEN GREATEST(0::bigint, a.cached_balance_cents - p_cents) < p_floor_cents
             THEN false
             ELSE a.customer_entitled
         END,
         cached_balance_at = now(),
         updated_at        = now()
   WHERE a.organization_id = p_org
   RETURNING a.cached_balance_cents, a.customer_entitled
   INTO v_new_balance, v_entitled;

  RETURN QUERY SELECT v_new_balance, v_entitled;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_billing_debit_balance_cache(bigint, bigint, bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_billing_debit_balance_cache(bigint, bigint, bigint) TO service_role;

COMMENT ON FUNCTION public.fn_billing_debit_balance_cache(bigint, bigint, bigint) IS
  'Atomic optimistic debit of the cached balance after a successful usage ingest. Webhook reconciles to ground truth later.';

COMMIT;
