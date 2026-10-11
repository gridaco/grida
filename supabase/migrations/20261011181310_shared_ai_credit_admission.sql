BEGIN;
ALTER TABLE grida_platform.product_executions DROP CONSTRAINT product_executions_state_check;
ALTER TABLE grida_platform.product_executions ADD CONSTRAINT product_executions_state_check CHECK(state IN ('claimed','dispatched','completed','closed'));
CREATE OR REPLACE FUNCTION public.platform_product_execution_claim(producer_id text, execution_id text, claim jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE oid bigint; row grida_platform.product_executions; inserted boolean; p grida_platform.product_producers; fields text[];
BEGIN
  PERFORM grida_platform.assert_authority();
  IF (SELECT phase FROM grida_platform.billing_owner WHERE singleton FOR SHARE)='draining' THEN RAISE EXCEPTION 'source admission closed' USING ERRCODE='42501'; END IF;
  fields:=ARRAY['organization_id','product','operation','model','unit','policy_version','request_digest','admission_observed_at','admission_expires_at'];
  IF claim->>'policy_version'='shared-ai-v1' THEN
    fields:=fields||ARRAY['authorized_mills','expense_bound_mills','tariff_revision'];
    IF coalesce(claim->>'authorized_mills','') !~ '^(0|[1-9][0-9]{0,18})(\.[0-9]{1,18})?$'
      OR coalesce(claim->>'expense_bound_mills','') !~ '^(0|[1-9][0-9]{0,18})(\.[0-9]{1,18})?$'
      OR coalesce(claim->>'tariff_revision','') !~ '^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'invalid execution bound' USING ERRCODE='22023'; END IF;
    IF (claim->>'authorized_mills')::numeric<0 OR (claim->>'expense_bound_mills')::numeric<0 THEN RAISE EXCEPTION 'nonnegative execution bound required' USING ERRCODE='22023'; END IF;
  ELSIF claim->>'policy_version' IS DISTINCT FROM 'legacy-ai-v1' THEN RAISE EXCEPTION 'unsupported execution policy' USING ERRCODE='22023'; END IF;
  SELECT * INTO p FROM grida_platform.product_producers WHERE producer=producer_id AND enabled;
  IF NOT FOUND THEN RAISE EXCEPTION 'producer denied' USING ERRCODE='42501'; END IF;
  IF claim IS NULL OR jsonb_typeof(claim) IS DISTINCT FROM 'object' OR (claim - fields) <> '{}'::jsonb
    OR NOT (claim ?& fields)
    OR EXISTS(SELECT 1 FROM jsonb_each(claim) kv WHERE jsonb_typeof(kv.value)<>'string' OR length(kv.value #>> '{}') NOT BETWEEN 1 AND 256)
    OR claim->>'unit' <> 'cost_mills' OR claim->>'product' <> p.product OR claim->>'request_digest' !~ '^[0-9a-f]{64}$'
    OR execution_id IS NULL OR execution_id !~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$' THEN RAISE EXCEPTION 'invalid execution claim' USING ERRCODE='22023'; END IF;
  oid := grida_platform.organization_id(claim->>'organization_id');
  -- A duplicate returns custody, never a new dispatch grant, even after deletion.
  SELECT * INTO row FROM grida_platform.product_executions e WHERE e.producer=producer_id AND e.execution_id=platform_product_execution_claim.execution_id FOR UPDATE;
  IF FOUND THEN
    IF row.claim <> claim THEN RAISE EXCEPTION 'execution identity conflict' USING ERRCODE='23505'; END IF;
    RETURN jsonb_build_object('created',false,'state',row.state);
  END IF;
  PERFORM 1 FROM grida_platform.account_states WHERE organization_id=oid AND state='active' FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'organization unavailable' USING ERRCODE='42501'; END IF;
  IF (claim->>'admission_observed_at')::timestamptz > clock_timestamp() OR (claim->>'admission_expires_at')::timestamptz <= clock_timestamp()
    OR (claim->>'admission_expires_at')::timestamptz > (claim->>'admission_observed_at')::timestamptz + interval '60 seconds' THEN
    RAISE EXCEPTION 'admission expired or invalid' USING ERRCODE='42501'; END IF;
  INSERT INTO grida_platform.product_executions(producer,execution_id,organization_id,claim) VALUES(producer_id,execution_id,oid,claim)
    ON CONFLICT DO NOTHING RETURNING * INTO row;
  inserted := FOUND;
  IF NOT inserted THEN
    SELECT * INTO STRICT row FROM grida_platform.product_executions e WHERE e.producer=producer_id AND e.execution_id=platform_product_execution_claim.execution_id FOR UPDATE;
    IF row.claim <> claim THEN RAISE EXCEPTION 'execution identity conflict' USING ERRCODE='23505'; END IF;
  END IF;
  RETURN jsonb_build_object('created',inserted,'state',row.state);
END $$;

CREATE TABLE grida_platform.product_closure_outbox (
 event_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 producer text NOT NULL,execution_id text NOT NULL,
 proof jsonb NOT NULL,acknowledged_at timestamptz,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(producer,execution_id),
 FOREIGN KEY(producer,execution_id) REFERENCES grida_platform.product_executions(producer,execution_id)
);
ALTER TABLE grida_platform.product_closure_outbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE grida_platform.product_closure_outbox FORCE ROW LEVEL SECURITY;
REVOKE ALL ON grida_platform.product_closure_outbox FROM PUBLIC,anon,authenticated,service_role;
-- Trusted producer-only closure. It must commit before releasing target credit.
-- Creating a tombstone before a delayed claim is intentional and permanent.
CREATE FUNCTION public.platform_product_execution_close(producer_id text,execution_id text,claim jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE row grida_platform.product_executions; oid bigint;
BEGIN
 IF producer_id IS DISTINCT FROM 'grida-ai' OR coalesce(execution_id,'') !~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$'
   OR jsonb_typeof(claim) IS DISTINCT FROM 'object' OR claim->>'policy_version' IS DISTINCT FROM 'shared-ai-v1'
   OR coalesce(claim->>'request_digest','') !~ '^[a-f0-9]{64}$'
   OR NOT(claim ?& ARRAY['organization_id','product','operation','model','unit','policy_version','request_digest','admission_observed_at','admission_expires_at','authorized_mills','expense_bound_mills','tariff_revision'])
   OR (SELECT count(*) FROM jsonb_object_keys(claim))<>12
   OR EXISTS(SELECT FROM jsonb_each(claim) kv WHERE jsonb_typeof(kv.value) IS DISTINCT FROM 'string' OR length(kv.value #>> '{}') NOT BETWEEN 1 AND 256)
   OR claim->>'product' IS DISTINCT FROM 'grida-ai' OR claim->>'unit' IS DISTINCT FROM 'cost_mills'
   OR coalesce(claim->>'authorized_mills','') !~ '^(0|[1-9][0-9]{0,18})(\.[0-9]{1,18})?$'
   OR coalesce(claim->>'expense_bound_mills','') !~ '^(0|[1-9][0-9]{0,18})(\.[0-9]{1,18})?$'
   OR coalesce(claim->>'tariff_revision','') !~ '^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'invalid execution closure' USING ERRCODE='22023'; END IF;
 oid:=grida_platform.organization_id(claim->>'organization_id');
 INSERT INTO grida_platform.product_executions(producer,execution_id,organization_id,claim,state)
 VALUES(producer_id,execution_id,oid,claim,'closed') ON CONFLICT DO NOTHING;
 SELECT * INTO STRICT row FROM grida_platform.product_executions e WHERE e.producer=producer_id AND e.execution_id=platform_product_execution_close.execution_id FOR UPDATE;
 IF row.claim IS DISTINCT FROM claim THEN RAISE EXCEPTION 'closure identity conflict' USING ERRCODE='23505'; END IF;
 IF row.state='claimed' THEN UPDATE grida_platform.product_executions e SET state='closed' WHERE e.producer=producer_id AND e.execution_id=row.execution_id;row.state:='closed'; END IF;
 IF row.state='closed' THEN
  INSERT INTO grida_platform.product_closure_outbox(producer,execution_id,proof) VALUES(producer_id,row.execution_id,jsonb_build_object('state','closed','source_instance',row.source_instance::text,'source_epoch',row.source_epoch::text,'execution_id',row.execution_id,'organization_id',row.organization_id::text,'request_digest',row.claim->>'request_digest')) ON CONFLICT DO NOTHING;
 END IF;
 RETURN jsonb_build_object('state',row.state,'source_instance',row.source_instance::text,'source_epoch',row.source_epoch::text,'execution_id',row.execution_id,'organization_id',row.organization_id::text,'request_digest',row.claim->>'request_digest');
END $$;
REVOKE ALL ON FUNCTION public.platform_product_execution_claim(text,text,jsonb),public.platform_product_execution_close(text,text,jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.platform_product_execution_claim(text,text,jsonb),public.platform_product_execution_close(text,text,jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.platform_product_execution_receipt(producer_id text, execution_id text, receipt jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE row grida_platform.product_executions; existing jsonb; field text;
BEGIN
  SELECT * INTO row FROM grida_platform.product_executions e WHERE e.producer=producer_id AND e.execution_id=platform_product_execution_receipt.execution_id FOR UPDATE;
  IF NOT FOUND OR row.state IN ('claimed','closed') THEN RAISE EXCEPTION 'execution not dispatched' USING ERRCODE='22023'; END IF;
  IF receipt IS NULL OR jsonb_typeof(receipt) IS DISTINCT FROM 'object' OR (receipt - ARRAY['organization_id','product','operation','model','unit','policy_version','outcome','quantity','occurred_at','evidence_digest']) <> '{}'::jsonb
    OR NOT (receipt ?& ARRAY['organization_id','product','operation','model','unit','policy_version','outcome','quantity','occurred_at','evidence_digest'])
    OR EXISTS(SELECT 1 FROM jsonb_each(receipt) kv WHERE jsonb_typeof(kv.value)<>'string' OR length(kv.value #>> '{}') NOT BETWEEN 1 AND 256)
    OR receipt->>'outcome' NOT IN ('succeeded','failed','cancelled') OR receipt->>'quantity' !~ '^(0|[1-9][0-9]{0,18})(\.[0-9]{1,18})?$'
    OR (receipt->>'quantity')::numeric > 9223372036854775807 OR receipt->>'evidence_digest' !~ '^[0-9a-f]{64}$'
    OR (receipt->>'occurred_at')::timestamptz > clock_timestamp() + interval '5 seconds' THEN RAISE EXCEPTION 'invalid execution receipt' USING ERRCODE='22023'; END IF;
  FOREACH field IN ARRAY ARRAY['organization_id','product','operation','model','unit','policy_version'] LOOP
    IF receipt->>field <> row.claim->>field THEN RAISE EXCEPTION 'receipt claim conflict' USING ERRCODE='23505'; END IF;
  END LOOP;
  SELECT o.receipt INTO existing FROM grida_platform.usage_outbox o WHERE o.producer=producer_id AND o.execution_id=row.execution_id;
  IF FOUND THEN
    IF existing <> receipt THEN RAISE EXCEPTION 'receipt identity conflict' USING ERRCODE='23505'; END IF;
    RETURN jsonb_build_object('accepted',true,'duplicate',true);
  END IF;
  INSERT INTO grida_platform.usage_outbox(producer,execution_id,receipt) VALUES(producer_id,execution_id,receipt);
  UPDATE grida_platform.product_executions e SET state='completed',completed_at=clock_timestamp() WHERE e.producer=producer_id AND e.execution_id=row.execution_id;
  RETURN jsonb_build_object('accepted',true,'duplicate',false);
END $$;
REVOKE ALL ON FUNCTION public.platform_product_execution_receipt(text,text,jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.platform_product_execution_receipt(text,text,jsonb) TO service_role;
CREATE FUNCTION public.platform_product_closure_page(batch_limit integer DEFAULT 100) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 PERFORM grida_platform.assert_primary();
 IF batch_limit IS NULL OR batch_limit NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'invalid batch limit' USING ERRCODE='22023'; END IF;
 RETURN jsonb_build_object('source_instance',(SELECT source_instance FROM grida_platform.authority),'events',coalesce((SELECT jsonb_agg(jsonb_build_object('event_id',event_id::text,'proof',proof) ORDER BY created_at,event_id) FROM (SELECT * FROM grida_platform.product_closure_outbox WHERE acknowledged_at IS NULL ORDER BY created_at,event_id LIMIT batch_limit) x),'[]'::jsonb));
END $$;
CREATE FUNCTION public.platform_product_closure_ack(event_ids uuid[]) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 PERFORM grida_platform.assert_primary();
 IF event_ids IS NULL OR cardinality(event_ids) NOT BETWEEN 1 AND 100 OR array_position(event_ids,NULL) IS NOT NULL THEN RAISE EXCEPTION 'invalid acknowledgement' USING ERRCODE='22023'; END IF;
 UPDATE grida_platform.product_closure_outbox SET acknowledged_at=coalesce(acknowledged_at,clock_timestamp()) WHERE event_id=ANY(event_ids);
 RETURN jsonb_build_object('acknowledged',true);
END $$;
REVOKE ALL ON FUNCTION public.platform_product_closure_page(integer),public.platform_product_closure_ack(uuid[]) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.platform_product_closure_page(integer),public.platform_product_closure_ack(uuid[]) TO service_role;
COMMIT;
