-- Additive source handoff controls. No financial ownership changes on install.
BEGIN;
ALTER TABLE grida_platform.billing_owner ADD COLUMN phase text NOT NULL DEFAULT 'active'
  CHECK (phase IN ('active','draining','transferred'));
UPDATE grida_platform.billing_owner SET phase='transferred' WHERE owner='infra';
ALTER TABLE grida_platform.billing_owner ADD COLUMN maintenance_hash text;
ALTER TABLE grida_platform.billing_owner ADD COLUMN maintenance_at timestamptz;
ALTER TABLE grida_platform.authority ADD COLUMN quarantined boolean NOT NULL DEFAULT false;

CREATE TABLE grida_platform.admitted_work (
  id uuid PRIMARY KEY,
  kind text NOT NULL CHECK(kind IN ('provider_http','legacy_ai')),
  owner_epoch bigint NOT NULL,
  source_instance uuid NOT NULL,
  source_epoch uuid NOT NULL,
  parent_id uuid REFERENCES grida_platform.admitted_work(id),
  request jsonb NOT NULL CHECK(jsonb_typeof(request)='object'),
  state text NOT NULL DEFAULT 'admitted' CHECK(state IN ('admitted','captured','completed','reconciled')),
  admitted_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  completed_at timestamptz,
  reconciliation_hash text CHECK(reconciliation_hash ~ '^[0-9a-f]{64}$'),
  reconciliation_disposition text CHECK(reconciliation_disposition IN ('no_external_effect','provider_effect_verified','target_custody'))
);
CREATE UNIQUE INDEX admitted_legacy_execution ON grida_platform.admitted_work ((request->>'organization_id'),(request->>'execution_id')) WHERE kind='legacy_ai';
CREATE INDEX admitted_work_unresolved ON grida_platform.admitted_work(admitted_at,id) WHERE state IN ('admitted','captured');
CREATE TABLE grida_platform.admitted_work_evidence (
  work_id uuid PRIMARY KEY REFERENCES grida_platform.admitted_work(id),
  evidence_hash text NOT NULL CHECK(evidence_hash ~ '^[0-9a-f]{64}$'),
  evidence jsonb NOT NULL CHECK(jsonb_typeof(evidence)='object'),
  captured_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE grida_platform.authority_recovery (
  source_epoch uuid PRIMARY KEY,
  prior_epoch uuid NOT NULL,
  manifest_hash text NOT NULL CHECK(manifest_hash ~ '^[0-9a-f]{64}$'),
  quarantined_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  reconciled_at timestamptz
);
ALTER TABLE grida_platform.admitted_work ENABLE ROW LEVEL SECURITY;
ALTER TABLE grida_platform.admitted_work FORCE ROW LEVEL SECURITY;
ALTER TABLE grida_platform.admitted_work_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE grida_platform.admitted_work_evidence FORCE ROW LEVEL SECURITY;
ALTER TABLE grida_platform.authority_recovery ENABLE ROW LEVEL SECURITY;
ALTER TABLE grida_platform.authority_recovery FORCE ROW LEVEL SECURITY;
REVOKE ALL ON grida_platform.admitted_work,grida_platform.admitted_work_evidence,grida_platform.authority_recovery FROM PUBLIC,anon,authenticated,service_role;

CREATE TABLE grida_platform.webhook_archive (
 provider text NOT NULL CHECK(provider IN ('stripe','metronome')),
 event_id text NOT NULL CHECK(length(event_id) BETWEEN 1 AND 256),
 body_hash text NOT NULL CHECK(body_hash ~ '^[0-9a-f]{64}$'),
 raw_body bytea NOT NULL CHECK(octet_length(raw_body) BETWEEN 1 AND 1048576),
 signature_headers jsonb NOT NULL,
 received_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 forwarded_at timestamptz,
 PRIMARY KEY(provider,event_id,body_hash)
);
ALTER TABLE grida_platform.webhook_archive ENABLE ROW LEVEL SECURITY;
ALTER TABLE grida_platform.webhook_archive FORCE ROW LEVEL SECURITY;
REVOKE ALL ON grida_platform.webhook_archive FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.platform_source_webhook_capture(provider_name text, event_id text, raw_body bytea, signature_headers jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE digest text := encode(sha256(raw_body),'hex');
BEGIN
 IF provider_name NOT IN ('stripe','metronome') OR event_id IS NULL OR length(event_id) NOT BETWEEN 1 AND 256 OR raw_body IS NULL OR octet_length(raw_body) NOT BETWEEN 1 AND 1048576
  OR signature_headers IS NULL OR jsonb_typeof(signature_headers)<>'object' OR octet_length(signature_headers::text)>8192 THEN RAISE EXCEPTION 'invalid webhook custody' USING ERRCODE='22023'; END IF;
 INSERT INTO grida_platform.webhook_archive(provider,event_id,body_hash,raw_body,signature_headers)
 VALUES(provider_name,event_id,digest,raw_body,signature_headers) ON CONFLICT DO NOTHING;
 RETURN jsonb_build_object('accepted',true,'body_hash',digest);
END $$;
CREATE FUNCTION public.platform_source_webhook_ack(provider_name text, event_id text, body_hash text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 UPDATE grida_platform.webhook_archive w SET forwarded_at=COALESCE(forwarded_at,clock_timestamp())
 WHERE w.provider=provider_name AND w.event_id=platform_source_webhook_ack.event_id AND w.body_hash=platform_source_webhook_ack.body_hash;
 IF NOT FOUND THEN RAISE EXCEPTION 'unknown webhook receipt' USING ERRCODE='22023'; END IF;
 RETURN jsonb_build_object('acknowledged',true);
END $$;
CREATE OR REPLACE FUNCTION public.platform_billing_owner() RETURNS jsonb
LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT jsonb_build_object('owner',o.owner,'epoch',o.epoch::text,'phase',o.phase,'quarantined',a.quarantined)
 FROM grida_platform.billing_owner o CROSS JOIN grida_platform.authority a
$$;
CREATE FUNCTION grida_platform.assert_authority() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 PERFORM grida_platform.assert_primary();
 PERFORM 1 FROM grida_platform.authority WHERE singleton AND NOT quarantined FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'source recovery requires reconciliation' USING ERRCODE='55000'; END IF;
END $$;
CREATE OR REPLACE FUNCTION grida_platform.guard_source_financial_write() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE s grida_platform.billing_owner;
BEGIN
 SELECT * INTO STRICT s FROM grida_platform.billing_owner WHERE singleton FOR SHARE;
 IF s.owner<>'grida' OR s.phase<>'active' THEN RAISE EXCEPTION 'source billing admission closed' USING ERRCODE='42501'; END IF;
 PERFORM grida_platform.assert_authority();
 RETURN NULL;
END $$;
CREATE OR REPLACE FUNCTION grida_platform.guard_source_commercial_flag() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE s grida_platform.billing_owner;
BEGIN
 IF NEW.is_enterprise IS NOT DISTINCT FROM OLD.is_enterprise THEN RETURN NEW; END IF;
 SELECT * INTO STRICT s FROM grida_platform.billing_owner WHERE singleton FOR SHARE;
 IF s.owner<>'grida' OR s.phase<>'active' THEN RAISE EXCEPTION 'commercial policy owner transferred' USING ERRCODE='42501'; END IF;
 PERFORM grida_platform.assert_authority();
 RETURN NEW;
END $$;
-- This short transaction holds no financial relation DDL locks. Existing SQL
-- writers finish before the phase changes; later writers fail at their trigger.
CREATE FUNCTION grida_platform.begin_billing_maintenance(expected_epoch bigint, preparation_hash text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE s grida_platform.billing_owner;
BEGIN
 IF preparation_hash IS NULL OR preparation_hash !~ '^[0-9a-f]{64}$' THEN RAISE EXCEPTION 'invalid preparation' USING ERRCODE='22023'; END IF;
 SELECT * INTO STRICT s FROM grida_platform.billing_owner WHERE singleton FOR UPDATE;
 IF s.owner<>'grida' OR s.epoch IS DISTINCT FROM expected_epoch OR s.phase='transferred' THEN RAISE EXCEPTION 'maintenance conflict' USING ERRCODE='23505'; END IF;
 IF s.phase='draining' AND s.maintenance_hash<>preparation_hash THEN RAISE EXCEPTION 'maintenance conflict' USING ERRCODE='23505'; END IF;
 UPDATE grida_platform.billing_owner SET phase='draining',maintenance_hash=preparation_hash,
 maintenance_at=COALESCE(maintenance_at,clock_timestamp()) WHERE singleton;
 RETURN public.platform_billing_owner();
END $$;

CREATE FUNCTION public.platform_source_work_begin(work_id uuid, work_kind text, request jsonb, parent_work_id uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE s grida_platform.billing_owner; a grida_platform.authority; p grida_platform.admitted_work; old grida_platform.admitted_work;
BEGIN
 PERFORM grida_platform.assert_authority();
 IF work_id IS NULL OR work_kind NOT IN ('provider_http','legacy_ai') OR request IS NULL OR jsonb_typeof(request)<>'object'
  OR octet_length(request::text)>2097152 OR request->>'request_digest' IS NULL OR request->>'request_digest' !~ '^[0-9a-f]{64}$' THEN
  RAISE EXCEPTION 'invalid admitted work' USING ERRCODE='22023'; END IF;
 SELECT * INTO STRICT s FROM grida_platform.billing_owner WHERE singleton FOR SHARE;
 SELECT * INTO STRICT a FROM grida_platform.authority WHERE singleton;
 SELECT * INTO old FROM grida_platform.admitted_work WHERE id=work_id;
 IF FOUND THEN
  IF old.kind<>work_kind OR old.request<>request OR old.parent_id IS DISTINCT FROM parent_work_id THEN RAISE EXCEPTION 'work identity conflict' USING ERRCODE='23505'; END IF;
  RETURN jsonb_build_object('created',false,'id',old.id,'state',old.state);
 END IF;
 IF parent_work_id IS NOT NULL THEN
  SELECT * INTO p FROM grida_platform.admitted_work WHERE id=parent_work_id FOR SHARE;
  IF NOT FOUND OR p.kind<>'legacy_ai' OR p.state<>'captured' OR p.owner_epoch<>s.epoch OR p.source_epoch<>a.source_epoch OR work_kind<>'provider_http' THEN
   RAISE EXCEPTION 'invalid completion parent' USING ERRCODE='42501'; END IF;
 END IF;
 IF s.owner<>'grida' OR (s.phase<>'active' AND NOT (s.phase='draining' AND parent_work_id IS NOT NULL)) THEN
  RAISE EXCEPTION 'source admission closed' USING ERRCODE='42501'; END IF;
 INSERT INTO grida_platform.admitted_work(id,kind,owner_epoch,source_instance,source_epoch,parent_id,request)
 VALUES(work_id,work_kind,s.epoch,a.source_instance,a.source_epoch,parent_work_id,request) ON CONFLICT DO NOTHING;
 IF NOT FOUND THEN RAISE EXCEPTION 'work already admitted' USING ERRCODE='23505'; END IF;
 RETURN jsonb_build_object('created',true,'id',work_id,'state','admitted');
END $$;
CREATE FUNCTION public.platform_source_work_capture(work_id uuid, evidence jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE w grida_platform.admitted_work; old grida_platform.admitted_work_evidence;
BEGIN
 IF evidence IS NULL OR jsonb_typeof(evidence)<>'object' OR octet_length(evidence::text)>2097152 THEN RAISE EXCEPTION 'invalid work evidence' USING ERRCODE='22023'; END IF;
 SELECT * INTO w FROM grida_platform.admitted_work WHERE id=work_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'unknown admitted work' USING ERRCODE='22023'; END IF;
 SELECT * INTO old FROM grida_platform.admitted_work_evidence e WHERE e.work_id=platform_source_work_capture.work_id;
 IF FOUND THEN
  IF old.evidence<>evidence THEN RAISE EXCEPTION 'work evidence conflict' USING ERRCODE='23505'; END IF;
  RETURN jsonb_build_object('accepted',true,'state',w.state);
 END IF;
 INSERT INTO grida_platform.admitted_work_evidence(work_id,evidence_hash,evidence)
 VALUES(work_id,encode(sha256(convert_to(evidence::text,'UTF8')),'hex'),evidence);
 -- A late response is a new immutable evidence row. Never rewrite an already
 -- exported reconciled work identity or pretend its old disposition proves it.
 IF w.state<>'reconciled' THEN
  UPDATE grida_platform.admitted_work SET state='captured' WHERE id=work_id;
 END IF;
 RETURN jsonb_build_object('accepted',true,'state',CASE WHEN w.state='reconciled' THEN w.state ELSE 'captured' END);
END $$;
-- Only legacy usage ACK can finish an AI work item. An HTTP response remains
-- captured/unclassified until the transfer manifest reconciles its side effect.
CREATE FUNCTION public.platform_source_work_finish(work_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE w grida_platform.admitted_work;
BEGIN
 SELECT * INTO w FROM grida_platform.admitted_work WHERE id=work_id FOR UPDATE;
 IF NOT FOUND OR w.kind<>'legacy_ai' OR w.state NOT IN ('captured','completed') THEN RAISE EXCEPTION 'invalid completion' USING ERRCODE='22023'; END IF;
 UPDATE grida_platform.admitted_work SET state='completed',completed_at=COALESCE(completed_at,clock_timestamp()) WHERE id=work_id;
 RETURN jsonb_build_object('accepted',true);
END $$;
CREATE FUNCTION grida_platform.reconcile_source_work(work_id uuid, evidence_hash text, disposition text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE w grida_platform.admitted_work;
BEGIN
 IF evidence_hash IS NULL OR evidence_hash !~ '^[0-9a-f]{64}$' OR disposition IS NULL OR disposition NOT IN ('no_external_effect','provider_effect_verified','target_custody') THEN RAISE EXCEPTION 'invalid reconciliation' USING ERRCODE='22023'; END IF;
 SELECT * INTO STRICT w FROM grida_platform.admitted_work WHERE id=work_id FOR UPDATE;
 IF w.state='completed' THEN RAISE EXCEPTION 'completed work is retained' USING ERRCODE='23505'; END IF;
 IF w.reconciliation_hash IS NOT NULL AND (w.reconciliation_hash<>evidence_hash OR w.reconciliation_disposition<>disposition) THEN RAISE EXCEPTION 'reconciliation conflict' USING ERRCODE='23505'; END IF;
 UPDATE grida_platform.admitted_work SET state='reconciled',reconciliation_hash=evidence_hash,reconciliation_disposition=disposition,
 completed_at=COALESCE(completed_at,clock_timestamp()) WHERE id=work_id;
END $$;
CREATE OR REPLACE FUNCTION grida_platform.transfer_billing_ownership(expected_epoch bigint, manifest_hash text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE s grida_platform.billing_owner; dependency record;
BEGIN
 IF manifest_hash IS NULL OR manifest_hash !~ '^[0-9a-f]{64}$' OR expected_epoch IS NULL OR expected_epoch<1 THEN RAISE EXCEPTION 'invalid transfer' USING ERRCODE='22023'; END IF;
 SELECT * INTO STRICT s FROM grida_platform.billing_owner WHERE singleton;
 IF s.owner='infra' AND s.epoch=expected_epoch+1 AND s.manifest_hash=transfer_billing_ownership.manifest_hash THEN RETURN public.platform_billing_owner(); END IF;
 IF s.owner<>'grida' OR s.phase<>'draining' OR s.epoch<>expected_epoch THEN RAISE EXCEPTION 'source maintenance required' USING ERRCODE='23505'; END IF;
 -- Maintenance committed earlier. Acquire relation locks before the owner row:
 -- a rejected late DML statement cannot deadlock waiting on a held owner row.
 -- Canonical org writers can enter the old onboarding trigger: take their
 -- outer relation first, then the financial relations in a fixed order.
 -- Busy incidental readers cause a clean retryable55P03 rather than waiting
 -- with partially held relation locks and assuming their transaction order.
 LOCK TABLE public.organization,grida_billing.account,grida_billing.audit,grida_billing.metronome_event,
 grida_billing.product_catalogue,grida_billing.stripe_event,grida_billing.subscription IN ACCESS EXCLUSIVE MODE NOWAIT;
 SELECT * INTO STRICT s FROM grida_platform.billing_owner WHERE singleton FOR UPDATE NOWAIT;
 IF s.owner<>'grida' OR s.phase<>'draining' OR s.epoch<>expected_epoch THEN RAISE EXCEPTION 'owner transfer conflict' USING ERRCODE='23505'; END IF;
 IF EXISTS(SELECT 1 FROM grida_platform.admitted_work WHERE state IN ('admitted','captured')) THEN RAISE EXCEPTION 'unresolved source work' USING ERRCODE='55000'; END IF;
 FOR dependency IN SELECT conrelid::regclass AS relation,conname FROM pg_constraint WHERE contype='f'
  AND confrelid='public.organization'::regclass AND connamespace='grida_billing'::regnamespace ORDER BY conrelid,conname LOOP
  EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I',dependency.relation,dependency.conname);
 END LOOP;
 DROP TRIGGER tg_billing_provision_on_org_insert ON public.organization;
 DROP TRIGGER tg_billing_organization_before_delete ON public.organization;
 UPDATE grida_platform.billing_owner SET owner='infra',phase='transferred',epoch=s.epoch+1,
 manifest_hash=transfer_billing_ownership.manifest_hash,transferred_at=clock_timestamp() WHERE singleton;
 RETURN public.platform_billing_owner();
END $$;

-- Epochs belong to accepted work, never to the delivery attempt. Before this
-- migration no supported epoch-rotation operation existed; retain that namespace.
ALTER TABLE grida_platform.product_executions ADD COLUMN source_instance uuid;
ALTER TABLE grida_platform.product_executions ADD COLUMN source_epoch uuid;
UPDATE grida_platform.product_executions SET source_instance=a.source_instance,source_epoch=a.source_epoch FROM grida_platform.authority a;
ALTER TABLE grida_platform.product_executions ALTER COLUMN source_instance SET NOT NULL;
ALTER TABLE grida_platform.product_executions ALTER COLUMN source_epoch SET NOT NULL;
ALTER TABLE grida_platform.usage_outbox ADD COLUMN source_instance uuid;
ALTER TABLE grida_platform.usage_outbox ADD COLUMN source_epoch uuid;
UPDATE grida_platform.usage_outbox o SET source_instance=e.source_instance,source_epoch=e.source_epoch FROM grida_platform.product_executions e WHERE e.producer=o.producer AND e.execution_id=o.execution_id;
ALTER TABLE grida_platform.usage_outbox ALTER COLUMN source_instance SET NOT NULL;
ALTER TABLE grida_platform.usage_outbox ALTER COLUMN source_epoch SET NOT NULL;
CREATE FUNCTION grida_platform.execution_namespace() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 PERFORM grida_platform.assert_authority();
 IF (SELECT phase FROM grida_platform.billing_owner WHERE singleton FOR SHARE)='draining' THEN RAISE EXCEPTION 'source admission closed' USING ERRCODE='42501'; END IF;
 SELECT source_instance,source_epoch INTO NEW.source_instance,NEW.source_epoch FROM grida_platform.authority WHERE singleton;
 RETURN NEW;
END $$;
CREATE TRIGGER execution_namespace BEFORE INSERT ON grida_platform.product_executions FOR EACH ROW EXECUTE FUNCTION grida_platform.execution_namespace();
CREATE FUNCTION grida_platform.receipt_namespace() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 SELECT source_instance,source_epoch INTO STRICT NEW.source_instance,NEW.source_epoch FROM grida_platform.product_executions WHERE producer=NEW.producer AND execution_id=NEW.execution_id;
 RETURN NEW;
END $$;
CREATE TRIGGER receipt_namespace BEFORE INSERT ON grida_platform.usage_outbox FOR EACH ROW EXECUTE FUNCTION grida_platform.receipt_namespace();
CREATE OR REPLACE FUNCTION public.platform_product_usage_page(batch_limit integer DEFAULT 100) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 PERFORM grida_platform.assert_primary();
 IF batch_limit IS NULL OR batch_limit NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'invalid batch limit' USING ERRCODE='22023'; END IF;
 RETURN jsonb_build_object('source_instance',(SELECT source_instance FROM grida_platform.authority),'source_epoch',(SELECT source_epoch FROM grida_platform.authority),'events',COALESCE((SELECT jsonb_agg(jsonb_build_object('source_instance',source_instance,'source_epoch',source_epoch,'event_id',event_id,'producer',producer,'execution_id',execution_id,'receipt',receipt) ORDER BY sequence)
 FROM (SELECT * FROM grida_platform.usage_outbox WHERE acknowledged_at IS NULL ORDER BY sequence LIMIT batch_limit) x),'[]'::jsonb));
END $$;
CREATE FUNCTION grida_platform.quarantine_source_restore(expected_epoch uuid, next_epoch uuid, manifest_hash text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE a grida_platform.authority;
BEGIN
 IF next_epoch IS NULL OR next_epoch=expected_epoch OR manifest_hash IS NULL OR manifest_hash !~ '^[0-9a-f]{64}$' THEN RAISE EXCEPTION 'invalid recovery' USING ERRCODE='22023'; END IF;
 SELECT * INTO STRICT a FROM grida_platform.authority WHERE singleton FOR UPDATE;
 IF a.source_epoch=next_epoch AND EXISTS(SELECT 1 FROM grida_platform.authority_recovery r WHERE r.source_epoch=next_epoch AND r.prior_epoch=expected_epoch AND r.manifest_hash=quarantine_source_restore.manifest_hash) THEN RETURN; END IF;
 IF a.source_epoch IS DISTINCT FROM expected_epoch OR a.quarantined OR EXISTS(SELECT 1 FROM grida_platform.authority_recovery r WHERE r.source_epoch=next_epoch OR r.prior_epoch=next_epoch) THEN RAISE EXCEPTION 'recovery conflict' USING ERRCODE='23505'; END IF;
 INSERT INTO grida_platform.authority_recovery(source_epoch,prior_epoch,manifest_hash) VALUES(next_epoch,expected_epoch,manifest_hash);
 UPDATE grida_platform.authority SET source_epoch=next_epoch,quarantined=true WHERE singleton;
END $$;
CREATE FUNCTION grida_platform.reconcile_source_restore(expected_epoch uuid, manifest_hash text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 PERFORM 1 FROM grida_platform.billing_owner WHERE singleton AND owner='infra' AND phase='transferred' FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'restored source financial writer is forbidden' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM grida_platform.authority WHERE singleton AND source_epoch=expected_epoch FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'recovery conflict' USING ERRCODE='23505'; END IF;
 UPDATE grida_platform.authority_recovery SET reconciled_at=COALESCE(reconciled_at,clock_timestamp()) WHERE source_epoch=expected_epoch AND authority_recovery.manifest_hash=reconcile_source_restore.manifest_hash;
 IF NOT FOUND THEN RAISE EXCEPTION 'recovery evidence mismatch' USING ERRCODE='23505'; END IF;
 UPDATE grida_platform.authority SET quarantined=false WHERE singleton;
END $$;
CREATE OR REPLACE FUNCTION grida_platform.assert_user() RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE subject uuid := auth.uid(); client text := auth.jwt()->>'client_id';
BEGIN
  PERFORM grida_platform.assert_authority();
  IF subject IS NULL OR (client IS NOT NULL AND NOT EXISTS (SELECT 1 FROM grida_platform.oauth_clients WHERE client_id = client)) THEN
    RAISE EXCEPTION 'canonical identity denied' USING ERRCODE = '42501';
  END IF;
  RETURN subject;
END $$;
CREATE OR REPLACE FUNCTION public.platform_gg_account_snapshots(refs jsonb, observation_id text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE ref jsonb; ids bigint[] := '{}'; oid bigint; t timestamptz := clock_timestamp(); result jsonb;
BEGIN
  PERFORM grida_platform.assert_authority();
  IF observation_id IS NULL OR observation_id !~ '^[A-Za-z0-9_-]{22,128}$' OR jsonb_typeof(refs) IS DISTINCT FROM 'array' OR jsonb_array_length(refs) NOT BETWEEN 1 AND 100 THEN
    RAISE EXCEPTION 'invalid snapshot request' USING ERRCODE='22023'; END IF;
  FOR ref IN SELECT value FROM jsonb_array_elements(refs) LOOP
    IF jsonb_typeof(ref) IS DISTINCT FROM 'object' OR (ref - 'id') <> '{}'::jsonb OR jsonb_typeof(ref->'id') IS DISTINCT FROM 'string' THEN
      RAISE EXCEPTION 'invalid organization reference' USING ERRCODE='22023'; END IF;
    oid := grida_platform.organization_id(ref->>'id');
    IF oid=ANY(ids) THEN RAISE EXCEPTION 'duplicate organization' USING ERRCODE='22023'; END IF;
    ids := array_append(ids,oid);
  END LOOP;
  SELECT jsonb_build_object('schema_version',1,'source_instance',a.source_instance,'source_epoch',a.source_epoch,'observed_at',t,'observation_id',observation_id,
    'organizations',(SELECT jsonb_agg(jsonb_build_object('id',wanted.id::text,'name',COALESCE(s.name,''),'display_name',COALESCE(s.display_name,''),'state',COALESCE(s.state,'deleted'),'source_version',COALESCE(s.version,0)::text) ORDER BY wanted.n)
      FROM unnest(ids) WITH ORDINALITY wanted(id,n) LEFT JOIN grida_platform.account_states s ON s.organization_id=wanted.id)) INTO result FROM grida_platform.authority a;
  RETURN result;
END $$;
CREATE OR REPLACE FUNCTION public.platform_product_execution_dispatch(producer_id text, execution_id text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE row grida_platform.product_executions;
BEGIN
  PERFORM grida_platform.assert_authority();
  IF (SELECT phase FROM grida_platform.billing_owner WHERE singleton FOR SHARE)='draining' THEN RAISE EXCEPTION 'source admission closed' USING ERRCODE='42501'; END IF;
  SELECT * INTO row FROM grida_platform.product_executions e WHERE e.producer=producer_id AND e.execution_id=platform_product_execution_dispatch.execution_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'unknown execution' USING ERRCODE='22023'; END IF;
  IF row.state <> 'claimed' THEN RETURN jsonb_build_object('dispatch',false,'state',row.state); END IF;
  IF NOT EXISTS(SELECT 1 FROM grida_platform.authority a WHERE a.source_instance=row.source_instance AND a.source_epoch=row.source_epoch) THEN RAISE EXCEPTION 'execution authority changed' USING ERRCODE='42501'; END IF;
  IF NOT EXISTS(SELECT 1 FROM grida_platform.product_producers WHERE producer=producer_id AND enabled) OR
    NOT EXISTS(SELECT 1 FROM grida_platform.account_states WHERE organization_id=row.organization_id AND state='active') OR
    (row.claim->>'admission_expires_at')::timestamptz <= clock_timestamp() THEN RAISE EXCEPTION 'admission unavailable' USING ERRCODE='42501'; END IF;
  UPDATE grida_platform.product_executions e SET state='dispatched',dispatched_at=clock_timestamp() WHERE e.producer=producer_id AND e.execution_id=row.execution_id;
  RETURN jsonb_build_object('dispatch',true,'state','dispatched');
END $$;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA grida_platform FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.platform_source_webhook_capture(text,text,bytea,jsonb),public.platform_source_webhook_ack(text,text,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.platform_source_webhook_capture(text,text,bytea,jsonb),public.platform_source_webhook_ack(text,text,text) TO service_role;
REVOKE ALL ON FUNCTION public.platform_source_work_begin(uuid,text,jsonb,uuid),public.platform_source_work_capture(uuid,jsonb),public.platform_source_work_finish(uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.platform_source_work_begin(uuid,text,jsonb,uuid),public.platform_source_work_capture(uuid,jsonb),public.platform_source_work_finish(uuid) TO service_role;
COMMIT;
