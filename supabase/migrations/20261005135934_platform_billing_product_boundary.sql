-- Source financial ownership is unchanged until the explicit reviewed handoff.
-- Canonical organizations and product execution custody remain source-owned.
BEGIN;
CREATE TABLE grida_platform.billing_owner (
  singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
  owner text NOT NULL DEFAULT 'grida' CHECK(owner IN ('grida','infra')),
  epoch bigint NOT NULL DEFAULT 1 CHECK(epoch > 0),
  manifest_hash text,
  transferred_at timestamptz,
  CHECK ((owner='grida' AND manifest_hash IS NULL AND transferred_at IS NULL)
    OR (owner='infra' AND manifest_hash ~ '^[0-9a-f]{64}$' AND transferred_at IS NOT NULL))
);
INSERT INTO grida_platform.billing_owner DEFAULT VALUES;
ALTER TABLE grida_platform.billing_owner ENABLE ROW LEVEL SECURITY;
ALTER TABLE grida_platform.billing_owner FORCE ROW LEVEL SECURITY;
REVOKE ALL ON grida_platform.billing_owner FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.platform_billing_owner() RETURNS jsonb
LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog AS $$
  SELECT jsonb_build_object('owner',owner,'epoch',epoch::text) FROM grida_platform.billing_owner WHERE singleton
$$;
REVOKE ALL ON FUNCTION public.platform_billing_owner() FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.platform_billing_owner() TO service_role;

-- Every financial write, including a SECURITY DEFINER RPC or TRUNCATE, holds
-- this row until transaction end. Transfer waits for committed source writers.
CREATE FUNCTION grida_platform.guard_source_financial_write() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE source_owner text;
BEGIN
  SELECT owner INTO STRICT source_owner FROM grida_platform.billing_owner WHERE singleton FOR SHARE;
  IF source_owner <> 'grida' THEN RAISE EXCEPTION 'billing owner transferred' USING ERRCODE='42501'; END IF;
  RETURN NULL;
END $$;
DO $$ DECLARE relation text; BEGIN
  FOREACH relation IN ARRAY ARRAY['account','subscription','product_catalogue','stripe_event','audit','metronome_event'] LOOP
    EXECUTE format('CREATE TRIGGER platform_billing_write_fence BEFORE INSERT OR UPDATE OR DELETE OR TRUNCATE ON grida_billing.%I FOR EACH STATEMENT EXECUTE FUNCTION grida_platform.guard_source_financial_write()',relation);
  END LOOP;
END $$;

CREATE FUNCTION grida_platform.guard_source_commercial_flag() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE source_owner text;
BEGIN
  IF NEW.is_enterprise IS NOT DISTINCT FROM OLD.is_enterprise THEN RETURN NEW; END IF;
  SELECT owner INTO STRICT source_owner FROM grida_platform.billing_owner WHERE singleton FOR SHARE;
  IF source_owner <> 'grida' THEN RAISE EXCEPTION 'commercial policy owner transferred' USING ERRCODE='42501'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER platform_commercial_flag_fence BEFORE UPDATE OF is_enterprise ON public.organization
FOR EACH ROW EXECUTE FUNCTION grida_platform.guard_source_commercial_flag();

-- Deliberately NOT callable by service_role or exposed through PostgREST.
-- The separately reviewed migration operator drains external calls and records
-- the export/reconciliation manifest before invoking this one-way local fence.
-- Provider credential revocation and target activation are separate M5 steps.
CREATE FUNCTION grida_platform.transfer_billing_ownership(expected_epoch bigint, manifest_hash text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE state grida_platform.billing_owner; relation text; dependency record;
BEGIN
  IF expected_epoch IS NULL OR expected_epoch < 1 OR manifest_hash IS NULL OR manifest_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'invalid owner transfer' USING ERRCODE='22023'; END IF;
  SELECT * INTO STRICT state FROM grida_platform.billing_owner WHERE singleton FOR UPDATE;
  IF state.owner='infra' AND state.epoch=expected_epoch+1 AND state.manifest_hash=transfer_billing_ownership.manifest_hash THEN
    RETURN jsonb_build_object('owner',state.owner,'epoch',state.epoch::text); END IF;
  IF state.owner<>'grida' OR state.epoch<>expected_epoch THEN RAISE EXCEPTION 'owner transfer conflict' USING ERRCODE='23505'; END IF;
  -- Preserve source financial archives after canonical organization deletion.
  -- Existing Grida-owned behavior and FKs remain untouched before activation.
  FOR dependency IN SELECT conrelid::regclass AS relation,conname FROM pg_constraint
    WHERE contype='f' AND confrelid='public.organization'::regclass
      AND connamespace='grida_billing'::regnamespace LOOP
    EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I',dependency.relation,dependency.conname);
  END LOOP;
  DROP TRIGGER tg_billing_provision_on_org_insert ON public.organization;
  DROP TRIGGER tg_billing_organization_before_delete ON public.organization;
  UPDATE grida_platform.billing_owner SET owner='infra',epoch=state.epoch+1,
    manifest_hash=transfer_billing_ownership.manifest_hash,transferred_at=clock_timestamp() WHERE singleton;
  RETURN jsonb_build_object('owner','infra','epoch',(state.epoch+1)::text);
END $$;
REVOKE ALL ON FUNCTION grida_platform.guard_source_financial_write(),grida_platform.guard_source_commercial_flag(),
  grida_platform.transfer_billing_ownership(bigint,text) FROM PUBLIC,anon,authenticated,service_role;

INSERT INTO grida_platform.product_producers(producer,product) VALUES('grida-ai','grida-ai');
-- Include the source namespace with permanent product receipt identities.
CREATE OR REPLACE FUNCTION public.platform_product_usage_page(batch_limit integer DEFAULT 100) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE authority grida_platform.authority;
BEGIN
  IF batch_limit IS NULL OR batch_limit NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'invalid batch limit' USING ERRCODE='22023'; END IF;
  SELECT * INTO STRICT authority FROM grida_platform.authority WHERE singleton;
  RETURN jsonb_build_object('source_instance',authority.source_instance,'source_epoch',authority.source_epoch,
    'events',COALESCE((SELECT jsonb_agg(jsonb_build_object('event_id',event_id,'producer',producer,'execution_id',execution_id,'receipt',receipt) ORDER BY sequence)
    FROM (SELECT * FROM grida_platform.usage_outbox WHERE acknowledged_at IS NULL ORDER BY sequence LIMIT batch_limit) x),'[]'::jsonb));
END $$;
REVOKE ALL ON FUNCTION public.platform_product_usage_page(integer) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.platform_product_usage_page(integer) TO service_role;
COMMIT;
