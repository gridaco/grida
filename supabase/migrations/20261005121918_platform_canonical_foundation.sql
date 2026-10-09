-- Canonical organization authority and producer custody. Financial ownership
-- remains in grida_billing until the separately verified cutover.
BEGIN;
CREATE SCHEMA grida_platform;
REVOKE ALL ON SCHEMA grida_platform FROM PUBLIC, anon, authenticated, service_role;

CREATE TABLE grida_platform.authority (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  source_instance uuid NOT NULL DEFAULT gen_random_uuid(),
  source_epoch uuid NOT NULL DEFAULT gen_random_uuid()
);
INSERT INTO grida_platform.authority DEFAULT VALUES;
CREATE TABLE grida_platform.oauth_clients (client_id text PRIMARY KEY CHECK (length(client_id) BETWEEN 1 AND 128));
CREATE TABLE grida_platform.account_states (
  organization_id bigint PRIMARY KEY CHECK (organization_id > 0),
  version bigint NOT NULL CHECK (version > 0),
  state text NOT NULL CHECK (state IN ('active', 'deleted')),
  name text NOT NULL,
  display_name text NOT NULL,
  observed_at timestamptz NOT NULL,
  deleted_at timestamptz,
  CHECK ((state = 'deleted') = (deleted_at IS NOT NULL))
);
-- Deliberately no FK to organization: tombstones and accepted execution custody
-- survive canonical product deletion. Identity reuse is rejected below.
CREATE TABLE grida_platform.lifecycle_outbox (
  sequence bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  event_id uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  organization_id bigint NOT NULL,
  version bigint NOT NULL,
  payload jsonb NOT NULL,
  acknowledged_at timestamptz,
  UNIQUE (organization_id, version)
);
CREATE INDEX lifecycle_unacknowledged ON grida_platform.lifecycle_outbox(sequence) WHERE acknowledged_at IS NULL;
CREATE TABLE grida_platform.product_producers (
  producer text PRIMARY KEY CHECK (producer ~ '^[a-z][a-z0-9._-]{0,95}$'),
  product text NOT NULL CHECK (product ~ '^[a-z][a-z0-9._-]{0,95}$' AND product <> 'gg'),
  enabled boolean NOT NULL DEFAULT true
);
CREATE TABLE grida_platform.product_executions (
  producer text NOT NULL REFERENCES grida_platform.product_producers(producer),
  execution_id text NOT NULL CHECK (execution_id ~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$'),
  organization_id bigint NOT NULL CHECK (organization_id > 0),
  claim jsonb NOT NULL,
  state text NOT NULL DEFAULT 'claimed' CHECK (state IN ('claimed','dispatched','completed')),
  claimed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  dispatched_at timestamptz,
  completed_at timestamptz,
  PRIMARY KEY (producer, execution_id)
);
CREATE TABLE grida_platform.usage_outbox (
  sequence bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  event_id uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  producer text NOT NULL,
  execution_id text NOT NULL,
  receipt jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  acknowledged_at timestamptz,
  UNIQUE(producer, execution_id),
  FOREIGN KEY(producer, execution_id) REFERENCES grida_platform.product_executions(producer, execution_id) ON DELETE RESTRICT
);
CREATE INDEX usage_unacknowledged ON grida_platform.usage_outbox(sequence) WHERE acknowledged_at IS NULL;
ALTER TABLE grida_platform.authority ENABLE ROW LEVEL SECURITY;
ALTER TABLE grida_platform.authority FORCE ROW LEVEL SECURITY;
ALTER TABLE grida_platform.oauth_clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE grida_platform.oauth_clients FORCE ROW LEVEL SECURITY;
ALTER TABLE grida_platform.account_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE grida_platform.account_states FORCE ROW LEVEL SECURITY;
ALTER TABLE grida_platform.lifecycle_outbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE grida_platform.lifecycle_outbox FORCE ROW LEVEL SECURITY;
ALTER TABLE grida_platform.product_producers ENABLE ROW LEVEL SECURITY;
ALTER TABLE grida_platform.product_producers FORCE ROW LEVEL SECURITY;
ALTER TABLE grida_platform.product_executions ENABLE ROW LEVEL SECURITY;
ALTER TABLE grida_platform.product_executions FORCE ROW LEVEL SECURITY;
ALTER TABLE grida_platform.usage_outbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE grida_platform.usage_outbox FORCE ROW LEVEL SECURITY;
REVOKE ALL ON ALL TABLES IN SCHEMA grida_platform FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA grida_platform FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION grida_platform.organization_id(value text) RETURNS bigint
LANGUAGE plpgsql IMMUTABLE SET search_path = pg_catalog AS $$
BEGIN
  IF value IS NULL OR value !~ '^[1-9][0-9]{0,18}$' OR value::numeric > 9223372036854775807 THEN
    RAISE EXCEPTION 'invalid organization id' USING ERRCODE = '22023';
  END IF;
  RETURN value::bigint;
END $$;
CREATE FUNCTION grida_platform.assert_primary() RETURNS void
LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
  IF pg_is_in_recovery() THEN RAISE EXCEPTION 'canonical primary required' USING ERRCODE = '55000'; END IF;
END $$;
CREATE FUNCTION grida_platform.assert_user() RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE subject uuid := auth.uid(); client text := auth.jwt()->>'client_id';
BEGIN
  PERFORM grida_platform.assert_primary();
  IF subject IS NULL OR (client IS NOT NULL AND NOT EXISTS (SELECT 1 FROM grida_platform.oauth_clients WHERE client_id = client)) THEN
    RAISE EXCEPTION 'canonical identity denied' USING ERRCODE = '42501';
  END IF;
  RETURN subject;
END $$;
CREATE FUNCTION grida_platform.emit_state(p_org bigint, p_name text, p_display text, p_state text, p_kind text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE s grida_platform.account_states; a grida_platform.authority; t timestamptz := clock_timestamp(); eid uuid := gen_random_uuid();
BEGIN
  INSERT INTO grida_platform.account_states AS old (organization_id, version, state, name, display_name, observed_at, deleted_at)
    VALUES (p_org, 1, p_state, p_name, p_display, t, CASE WHEN p_state = 'deleted' THEN t END)
  ON CONFLICT (organization_id) DO UPDATE SET version = old.version + 1,
    state = excluded.state, name = excluded.name, display_name = excluded.display_name,
    observed_at = excluded.observed_at, deleted_at = excluded.deleted_at
  WHERE old.state <> 'deleted'
  RETURNING * INTO s;
  IF NOT FOUND THEN RETURN; END IF;
  SELECT * INTO STRICT a FROM grida_platform.authority;
  INSERT INTO grida_platform.lifecycle_outbox(event_id, organization_id, version, payload) VALUES
    (eid, p_org, s.version, jsonb_build_object('event_id', eid, 'source_instance', a.source_instance,
      'source_epoch', a.source_epoch, 'organization_id', p_org::text, 'version', s.version::text,
      'name', p_name, 'display_name', p_display, 'state', p_state,
      'kind', p_kind, 'observed_at', t, 'occurred_at', t));
END $$;
CREATE FUNCTION grida_platform.organization_identity_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
BEGIN
  IF (TG_OP = 'UPDATE' AND NEW.id <> OLD.id) OR (TG_OP = 'INSERT' AND EXISTS (
    SELECT 1 FROM grida_platform.account_states WHERE organization_id = NEW.id)) THEN
    RAISE EXCEPTION 'canonical organization identity is permanent' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
CREATE FUNCTION grida_platform.organization_changed() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM grida_platform.emit_state(OLD.id, OLD.name, OLD.display_name, 'deleted', 'organization.deleted');
    RETURN OLD;
  END IF;
  IF TG_OP = 'UPDATE' AND NEW IS NOT DISTINCT FROM OLD THEN RETURN NEW; END IF;
  PERFORM grida_platform.emit_state(NEW.id, NEW.name, NEW.display_name, 'active',
    CASE WHEN TG_OP = 'INSERT' THEN 'organization.created' ELSE 'organization.updated' END);
  RETURN NEW;
END $$;
CREATE FUNCTION grida_platform.membership_changed() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE ids bigint[]; org record;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW IS NOT DISTINCT FROM OLD THEN RETURN NEW; END IF;
  IF TG_OP = 'INSERT' THEN ids := ARRAY[NEW.organization_id];
  ELSIF TG_OP = 'DELETE' THEN ids := ARRAY[OLD.organization_id];
  ELSE ids := ARRAY[OLD.organization_id, NEW.organization_id]; END IF;
  -- Missing parent means cascading organization deletion; the organization
  -- trigger emits the permanent tombstone. Lock order is stable for moves.
  -- Lock the canonical row before reading metadata so a concurrent rename cannot
  -- commit and then be overwritten in the state table by this older observation.
  FOR org IN SELECT id, name, display_name FROM public.organization WHERE id = ANY(ids) ORDER BY id FOR SHARE LOOP
    PERFORM grida_platform.emit_state(org.id, org.name, org.display_name, 'active', 'membership.changed');
  END LOOP;
  RETURN NULL;
END $$;
CREATE FUNCTION grida_platform.reject_canonical_truncate() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
  RAISE EXCEPTION 'canonical lifecycle requires row mutations' USING ERRCODE='23514';
END $$;
CREATE TRIGGER platform_no_truncate BEFORE TRUNCATE ON public.organization FOR EACH STATEMENT EXECUTE FUNCTION grida_platform.reject_canonical_truncate();
CREATE TRIGGER platform_no_truncate BEFORE TRUNCATE ON public.organization_member FOR EACH STATEMENT EXECUTE FUNCTION grida_platform.reject_canonical_truncate();
-- Bootstrap at the migration's transaction boundary before future writers can
-- reach these triggers. The source epoch is retained across process restarts.
LOCK TABLE public.organization, public.organization_member IN SHARE ROW EXCLUSIVE MODE;
DO $$ DECLARE org record; BEGIN
  FOR org IN SELECT id, name, display_name FROM public.organization ORDER BY id LOOP
    PERFORM grida_platform.emit_state(org.id, org.name, org.display_name, 'active', 'organization.snapshot');
  END LOOP;
END $$;
CREATE TRIGGER platform_identity_guard BEFORE INSERT OR UPDATE ON public.organization FOR EACH ROW EXECUTE FUNCTION grida_platform.organization_identity_guard();
CREATE TRIGGER platform_organization_changed AFTER INSERT OR UPDATE OR DELETE ON public.organization FOR EACH ROW EXECUTE FUNCTION grida_platform.organization_changed();
CREATE TRIGGER platform_membership_changed AFTER INSERT OR UPDATE OR DELETE ON public.organization_member FOR EACH ROW EXECUTE FUNCTION grida_platform.membership_changed();

CREATE FUNCTION public.platform_account_context(organization_id text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE uid uuid := grida_platform.assert_user(); oid bigint := grida_platform.organization_id(organization_id); result jsonb; t timestamptz := clock_timestamp();
BEGIN
  SELECT jsonb_build_object('schema_version',1,'authority','grida','subject',jsonb_build_object('id',uid),
    'source_instance',a.source_instance,'source_epoch',a.source_epoch,'observed_at',t,
    'organization',jsonb_build_object('id',o.id::text,'name',o.name,'display_name',o.display_name,'state','active','version',s.version::text),
    'role',CASE WHEN o.owner_id = uid THEN 'owner' ELSE 'member' END,'policy_version','organization-access-1')
  INTO result FROM public.organization o JOIN grida_platform.account_states s ON s.organization_id=o.id
  CROSS JOIN grida_platform.authority a
  WHERE o.id=oid AND s.state='active' AND EXISTS (SELECT 1 FROM public.organization_member m WHERE m.organization_id=o.id AND m.user_id=uid);
  IF result IS NULL THEN RAISE EXCEPTION 'organization access denied' USING ERRCODE='42501'; END IF;
  RETURN result;
END $$;
CREATE FUNCTION public.platform_organizations_page(after_id text DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE uid uuid := grida_platform.assert_user(); cursor_id bigint := CASE WHEN after_id IS NULL THEN 0 ELSE grida_platform.organization_id(after_id) END; result jsonb;
BEGIN
  WITH page AS (SELECT o.id, o.name, o.display_name, s.version FROM public.organization o
    JOIN grida_platform.account_states s ON s.organization_id=o.id AND s.state='active'
    WHERE o.id>cursor_id AND EXISTS(SELECT 1 FROM public.organization_member m WHERE m.organization_id=o.id AND m.user_id=uid)
    ORDER BY o.id LIMIT 101), visible AS (SELECT * FROM page ORDER BY id LIMIT 100)
  SELECT jsonb_build_object('data',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',id::text,'name',name,'display_name',display_name,'state','active','version',version::text) ORDER BY id) FROM visible),'[]'::jsonb),
    'next_cursor',CASE WHEN (SELECT count(*) FROM page)>100 THEN (SELECT max(id)::text FROM visible) END) INTO result;
  RETURN result;
END $$;
CREATE FUNCTION public.platform_gg_account_snapshots(refs jsonb, observation_id text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE ref jsonb; ids bigint[] := '{}'; oid bigint; t timestamptz := clock_timestamp(); result jsonb;
BEGIN
  PERFORM grida_platform.assert_primary();
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
CREATE FUNCTION public.platform_lifecycle_page(batch_limit integer DEFAULT 100) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
BEGIN
  PERFORM grida_platform.assert_primary();
  IF batch_limit IS NULL OR batch_limit NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'invalid batch limit' USING ERRCODE='22023'; END IF;
  -- No sequence cursor: allocation order is not commit order. An early uncommitted
  -- event must still be delivered after a later event has been acknowledged.
  RETURN jsonb_build_object('events',COALESCE((SELECT jsonb_agg(payload ORDER BY sequence) FROM
    (SELECT sequence,payload FROM grida_platform.lifecycle_outbox WHERE acknowledged_at IS NULL ORDER BY sequence LIMIT batch_limit) x),'[]'::jsonb));
END $$;
CREATE FUNCTION public.platform_lifecycle_ack(event_ids uuid[]) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
BEGIN
  IF event_ids IS NULL OR cardinality(event_ids) NOT BETWEEN 1 AND 100 OR array_position(event_ids,NULL) IS NOT NULL THEN RAISE EXCEPTION 'invalid acknowledgement' USING ERRCODE='22023'; END IF;
  IF EXISTS(SELECT 1 FROM unnest(event_ids) x WHERE NOT EXISTS(SELECT 1 FROM grida_platform.lifecycle_outbox o WHERE o.event_id=x)) THEN
    RAISE EXCEPTION 'unknown lifecycle event' USING ERRCODE='22023'; END IF;
  UPDATE grida_platform.lifecycle_outbox SET acknowledged_at=COALESCE(acknowledged_at,clock_timestamp()) WHERE event_id=ANY(event_ids);
  RETURN jsonb_build_object('acknowledged',true);
END $$;

-- Source product producers hold these rows before calling a provider. A
-- dispatched claim is never reset: after a crash its outcome is unknown until
-- trustworthy completion evidence is reconciled. Financial intake is elsewhere.
CREATE FUNCTION public.platform_product_execution_claim(producer_id text, execution_id text, claim jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE oid bigint; row grida_platform.product_executions; inserted boolean; p grida_platform.product_producers;
BEGIN
  SELECT * INTO p FROM grida_platform.product_producers WHERE producer=producer_id AND enabled;
  IF NOT FOUND THEN RAISE EXCEPTION 'producer denied' USING ERRCODE='42501'; END IF;
  IF claim IS NULL OR jsonb_typeof(claim) IS DISTINCT FROM 'object' OR (claim - ARRAY['organization_id','product','operation','model','unit','policy_version','request_digest','admission_observed_at','admission_expires_at']) <> '{}'::jsonb
    OR NOT (claim ?& ARRAY['organization_id','product','operation','model','unit','policy_version','request_digest','admission_observed_at','admission_expires_at'])
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
CREATE FUNCTION public.platform_product_execution_dispatch(producer_id text, execution_id text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE row grida_platform.product_executions;
BEGIN
  SELECT * INTO row FROM grida_platform.product_executions e WHERE e.producer=producer_id AND e.execution_id=platform_product_execution_dispatch.execution_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'unknown execution' USING ERRCODE='22023'; END IF;
  IF row.state <> 'claimed' THEN RETURN jsonb_build_object('dispatch',false,'state',row.state); END IF;
  IF NOT EXISTS(SELECT 1 FROM grida_platform.product_producers WHERE producer=producer_id AND enabled) OR
    NOT EXISTS(SELECT 1 FROM grida_platform.account_states WHERE organization_id=row.organization_id AND state='active') OR
    (row.claim->>'admission_expires_at')::timestamptz <= clock_timestamp() THEN RAISE EXCEPTION 'admission unavailable' USING ERRCODE='42501'; END IF;
  UPDATE grida_platform.product_executions e SET state='dispatched',dispatched_at=clock_timestamp() WHERE e.producer=producer_id AND e.execution_id=row.execution_id;
  RETURN jsonb_build_object('dispatch',true,'state','dispatched');
END $$;
CREATE FUNCTION public.platform_product_execution_receipt(producer_id text, execution_id text, receipt jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE row grida_platform.product_executions; existing jsonb; field text;
BEGIN
  SELECT * INTO row FROM grida_platform.product_executions e WHERE e.producer=producer_id AND e.execution_id=platform_product_execution_receipt.execution_id FOR UPDATE;
  IF NOT FOUND OR row.state='claimed' THEN RAISE EXCEPTION 'execution not dispatched' USING ERRCODE='22023'; END IF;
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
CREATE FUNCTION public.platform_product_usage_page(batch_limit integer DEFAULT 100) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
BEGIN
  IF batch_limit IS NULL OR batch_limit NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'invalid batch limit' USING ERRCODE='22023'; END IF;
  RETURN jsonb_build_object('events',COALESCE((SELECT jsonb_agg(jsonb_build_object('event_id',event_id,'producer',producer,'execution_id',execution_id,'receipt',receipt) ORDER BY sequence)
    FROM (SELECT * FROM grida_platform.usage_outbox WHERE acknowledged_at IS NULL ORDER BY sequence LIMIT batch_limit) x),'[]'::jsonb));
END $$;
CREATE FUNCTION public.platform_product_usage_ack(event_ids uuid[]) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
BEGIN
  IF event_ids IS NULL OR cardinality(event_ids) NOT BETWEEN 1 AND 100 OR array_position(event_ids,NULL) IS NOT NULL THEN RAISE EXCEPTION 'invalid acknowledgement' USING ERRCODE='22023'; END IF;
  IF EXISTS(SELECT 1 FROM unnest(event_ids) x WHERE NOT EXISTS(SELECT 1 FROM grida_platform.usage_outbox o WHERE o.event_id=x)) THEN RAISE EXCEPTION 'unknown usage event' USING ERRCODE='22023'; END IF;
  UPDATE grida_platform.usage_outbox SET acknowledged_at=COALESCE(acknowledged_at,clock_timestamp()) WHERE event_id=ANY(event_ids);
  RETURN jsonb_build_object('acknowledged',true);
END $$;
-- No broad public/default changes: every new signature is explicitly scoped.
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA grida_platform FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.platform_account_context(text), public.platform_organizations_page(text),
  public.platform_gg_account_snapshots(jsonb,text), public.platform_lifecycle_page(integer), public.platform_lifecycle_ack(uuid[]),
  public.platform_product_execution_claim(text,text,jsonb), public.platform_product_execution_dispatch(text,text), public.platform_product_execution_receipt(text,text,jsonb),
  public.platform_product_usage_page(integer), public.platform_product_usage_ack(uuid[]) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.platform_account_context(text), public.platform_organizations_page(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.platform_gg_account_snapshots(jsonb,text), public.platform_lifecycle_page(integer), public.platform_lifecycle_ack(uuid[]),
  public.platform_product_execution_claim(text,text,jsonb), public.platform_product_execution_dispatch(text,text), public.platform_product_execution_receipt(text,text,jsonb),
  public.platform_product_usage_page(integer), public.platform_product_usage_ack(uuid[]) TO service_role;
COMMIT;
