-- pgTAP regression: role contracts repaired by
-- 20260924045429_grida_ciam_forms_commerce_grants.
--
-- 1. CIAM OTP/portal-session minting RPCs are service-only: effective
--    EXECUTE (including PUBLIC's default ACL), every overload, and real calls
--    per role. Bearer-token RPCs stay public.
-- 2. Editor-owned grida_forms tables are visible/writable only to members of
--    the owning project; anon has no table access; a member cannot attach
--    rows to another tenant's form, field, optgroup, page, document, store
--    or x-supabase project/table.
-- 3. Inventory is readable only by members of the store's project; writes
--    stay service-only.
--
-- Personas: insider@grida.co (project "dev"), alice@acme.com
-- (project "acme-project", other tenant), random@example.com (no
-- membership), anon. Every fixture rolls back.

BEGIN;

SELECT plan(140);

---------------------------------------------------------------------
-- [1] CIAM RPC ACLs
---------------------------------------------------------------------

CREATE TEMP TABLE ciam_service_only (signature text PRIMARY KEY);
INSERT INTO ciam_service_only (signature) VALUES
  ('grida_ciam_public.create_customer_otp_challenge(bigint, text, text, integer)'),
  ('grida_ciam_public.verify_customer_otp_and_create_session(uuid, text, integer)'),
  ('grida_ciam_public.create_customer_portal_session(bigint, uuid, integer, integer, text[])'),
  ('grida_ciam_public.revoke_customer_portal_sessions(bigint, uuid)');
GRANT SELECT ON ciam_service_only TO anon, authenticated, service_role;

SELECT ok(
  NOT has_function_privilege('anon', to_regprocedure(signature), 'EXECUTE'),
  'anon cannot execute ' || signature
) FROM ciam_service_only ORDER BY signature;

SELECT ok(
  NOT has_function_privilege('authenticated', to_regprocedure(signature), 'EXECUTE'),
  'authenticated cannot execute ' || signature
) FROM ciam_service_only ORDER BY signature;

SELECT ok(
  has_function_privilege('service_role', to_regprocedure(signature), 'EXECUTE'),
  'service_role can execute ' || signature
) FROM ciam_service_only ORDER BY signature;

-- NULL proacl means the default ACL, which includes PUBLIC EXECUTE.
SELECT ok(
  NOT EXISTS (
    SELECT 1
      FROM pg_proc p
      CROSS JOIN LATERAL aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) acl
     WHERE p.oid = to_regprocedure(signature)
       AND acl.grantee = 0 AND acl.privilege_type = 'EXECUTE'
  ),
  'PUBLIC has no EXECUTE ACL on ' || signature
) FROM ciam_service_only ORDER BY signature;

-- Bearer-token RPCs: the token is the capability, callable from the portal.
SELECT ok(
  has_function_privilege('anon', 'grida_ciam_public.redeem_customer_portal_session(text, boolean)', 'EXECUTE'),
  'anon can still redeem a portal session token'
);
SELECT ok(
  has_function_privilege('anon', 'grida_ciam_public.touch_customer_portal_session(text, integer)', 'EXECUTE'),
  'anon can still touch a portal session token'
);

-- Catalog discovery: a new overload or definer RPC must fail here instead of
-- escaping the fixed list above.
SELECT set_eq(
  $$SELECT format('grida_ciam_public.%s(%s)', p.proname, oidvectortypes(p.proargtypes))
      FROM pg_proc p
     WHERE p.pronamespace = 'grida_ciam_public'::regnamespace
       AND p.proname IN ('create_customer_otp_challenge',
                         'verify_customer_otp_and_create_session',
                         'create_customer_portal_session',
                         'revoke_customer_portal_sessions')$$,
  $$SELECT signature FROM ciam_service_only$$,
  'the service-only CIAM RPC family has no other overloads'
);
SELECT set_eq(
  $$SELECT format('%s(%s)', p.proname, oidvectortypes(p.proargtypes))
      FROM pg_proc p
     WHERE p.pronamespace = 'grida_ciam_public'::regnamespace
       AND p.prosecdef
       AND has_function_privilege('anon', p.oid, 'EXECUTE')$$,
  ARRAY['redeem_customer_portal_session(text, boolean)',
        'touch_customer_portal_session(text, integer)'],
  'only the bearer-token CIAM RPCs are anon-callable definer functions'
);
SELECT set_eq(
  $$SELECT format('%s(%s)', p.proname, oidvectortypes(p.proargtypes))
      FROM pg_proc p
     WHERE p.pronamespace = 'grida_ciam_public'::regnamespace
       AND p.prosecdef
       AND has_function_privilege('authenticated', p.oid, 'EXECUTE')$$,
  ARRAY['redeem_customer_portal_session(text, boolean)',
        'set_primary_portal_preset(bigint, uuid)',
        'touch_customer_portal_session(text, integer)'],
  'authenticated definer CIAM RPCs are the bearer-token and member-guarded ones'
);

---------------------------------------------------------------------
-- Fixtures: one full forms/commerce graph per tenant (bypasses RLS)
---------------------------------------------------------------------

CREATE TEMP TABLE fx (
  tenant text PRIMARY KEY,
  project_id bigint,
  customer_uid uuid,
  form_id uuid,
  form2_id uuid,
  page_id uuid,
  spare_doc_id uuid,
  field_id uuid,
  optgroup_id uuid,
  option_id uuid,
  block_id uuid,
  schema_id uuid,
  sb_project_id bigint,
  sb_table_id bigint,
  conn_sb_id bigint,
  store_id bigint,
  conn_store_id bigint,
  item_id bigint,
  level_id bigint,
  commit_id bigint
);
GRANT SELECT ON fx TO anon, authenticated, service_role;

DO $$
DECLARE
  t record;
  r fx%ROWTYPE;
BEGIN
  FOR t IN
    SELECT * FROM (VALUES ('insider', 'dev'), ('alice', 'acme-project')) v(tenant, project)
  LOOP
    r := NULL;
    r.tenant := t.tenant;
    SELECT id INTO r.project_id FROM public.project WHERE name = t.project;

    INSERT INTO public.customer (project_id, email)
    VALUES (r.project_id, t.tenant || '-customer@example.com')
    RETURNING uid INTO r.customer_uid;

    INSERT INTO grida_forms.form (project_id, title)
    VALUES (r.project_id, t.tenant || ' form') RETURNING id INTO r.form_id;
    -- A second form without a page, for form_document inserts.
    INSERT INTO grida_forms.form (project_id, title)
    VALUES (r.project_id, t.tenant || ' form 2') RETURNING id INTO r.form2_id;

    INSERT INTO public.document (doctype, project_id)
    VALUES ('v0_form', r.project_id) RETURNING id INTO r.page_id;
    INSERT INTO grida_forms.form_document (id, form_id, project_id)
    VALUES (r.page_id, r.form_id, r.project_id);
    -- An unattached document in the tenant's project.
    INSERT INTO public.document (doctype, project_id)
    VALUES ('v0_form', r.project_id) RETURNING id INTO r.spare_doc_id;

    INSERT INTO grida_forms.attribute (form_id, name)
    VALUES (r.form_id, 'choice') RETURNING id INTO r.field_id;
    INSERT INTO grida_forms.optgroup (form_id, form_field_id, label)
    VALUES (r.form_id, r.field_id, 'group') RETURNING id INTO r.optgroup_id;
    INSERT INTO grida_forms.option (form_id, form_field_id, value, optgroup_id)
    VALUES (r.form_id, r.field_id, 'a', r.optgroup_id) RETURNING id INTO r.option_id;
    INSERT INTO grida_forms.form_block (form_id, form_page_id, type, form_field_id)
    VALUES (r.form_id, r.page_id, 'field', r.field_id) RETURNING id INTO r.block_id;

    INSERT INTO public.document (doctype, project_id)
    VALUES ('v0_schema', r.project_id) RETURNING id INTO r.schema_id;
    INSERT INTO grida_forms.schema_document (id, name, project_id)
    VALUES (r.schema_id, t.tenant || '_schema', r.project_id);

    INSERT INTO grida_x_supabase.supabase_project (
      project_id, sb_anon_key, sb_project_reference_id, sb_project_url,
      sb_public_schema, sb_schema_definitions, sb_schema_openapi_docs
    )
    VALUES (r.project_id, 'anon-key', t.tenant || '-ref', 'https://example.invalid',
            '{}'::jsonb, '{}'::jsonb, '{}'::jsonb)
    RETURNING id INTO r.sb_project_id;
    INSERT INTO grida_x_supabase.supabase_table (
      supabase_project_id, sb_schema_name, sb_table_name, sb_table_schema, sb_postgrest_methods
    )
    VALUES (r.sb_project_id, 'public', t.tenant || '_table', '{}'::jsonb,
            ARRAY['get']::grida_x_supabase.sb_postgrest_method[])
    RETURNING id INTO r.sb_table_id;
    INSERT INTO grida_forms.connection_supabase (form_id, supabase_project_id)
    VALUES (r.form_id, r.sb_project_id) RETURNING id INTO r.conn_sb_id;

    INSERT INTO grida_commerce.store (project_id, name)
    VALUES (r.project_id, t.tenant || ' store') RETURNING id INTO r.store_id;
    INSERT INTO grida_forms.connection_commerce_store (form_id, project_id, store_id)
    VALUES (r.form_id, r.project_id, r.store_id) RETURNING id INTO r.conn_store_id;

    -- Triggers initialize the level and its first commit.
    INSERT INTO grida_commerce.inventory_item (store_id, sku)
    VALUES (r.store_id, t.tenant || '-sku') RETURNING id INTO r.item_id;
    SELECT id INTO r.level_id FROM grida_commerce.inventory_level
     WHERE inventory_item_id = r.item_id;
    SELECT id INTO r.commit_id FROM grida_commerce.inventory_level_commit
     WHERE inventory_level_id = r.level_id LIMIT 1;

    INSERT INTO fx VALUES (r.*);
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION pg_temp.as_user(p_email text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claim.sub',
    (SELECT id::text FROM auth.users WHERE email = p_email), true);
  SET LOCAL ROLE authenticated;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.as_nobody()
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  RESET ROLE;
  PERFORM set_config('request.jwt.claim.sub', '', true);
END;
$$;

-- Rows changed by a statement, as the current role (RLS filters silently).
CREATE OR REPLACE FUNCTION pg_temp.affected(p_sql text)
RETURNS bigint LANGUAGE plpgsql AS $$
DECLARE n bigint;
BEGIN
  EXECUTE p_sql;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

---------------------------------------------------------------------
-- [1] CIAM real calls. Valid arguments, so only the privilege check can
-- refuse. The server flow runs as service_role.
---------------------------------------------------------------------

SET LOCAL ROLE service_role;
SELECT ok(
  set_config('grants_test.challenge_id',
    grida_ciam_public.create_customer_otp_challenge(
      (SELECT project_id FROM fx WHERE tenant = 'insider'),
      'insider-customer@example.com', '000000', 600)::text,
    true) IS NOT NULL,
  'service_role can create an OTP challenge'
);
RESET ROLE;

CREATE TEMP TABLE ciam_calls (label text PRIMARY KEY, sql text);
INSERT INTO ciam_calls
SELECT v.label, v.sql
  FROM fx, LATERAL (VALUES
    ('create an OTP challenge with a caller-chosen OTP',
     format($q$SELECT grida_ciam_public.create_customer_otp_challenge(%s, %L, '000000', 600)$q$,
            fx.project_id, 'insider-customer@example.com')),
    ('verify an OTP challenge',
     format($q$SELECT * FROM grida_ciam_public.verify_customer_otp_and_create_session(%L, '000000', 0)$q$,
            current_setting('grants_test.challenge_id'))),
    ('mint a portal session for a customer',
     format($q$SELECT * FROM grida_ciam_public.create_customer_portal_session(%s, %L)$q$,
            fx.project_id, fx.customer_uid)),
    ('revoke a customer''s portal sessions',
     format($q$SELECT grida_ciam_public.revoke_customer_portal_sessions(%s, %L)$q$,
            fx.project_id, fx.customer_uid))
  ) v(label, sql)
 WHERE fx.tenant = 'insider';
GRANT SELECT ON ciam_calls TO anon, authenticated;

SET LOCAL ROLE anon;
SELECT throws_ok(sql, '42501', NULL, 'anon cannot ' || label)
  FROM ciam_calls ORDER BY label;
SELECT pg_temp.as_nobody();

-- Even a member of the customer's project is refused.
SELECT pg_temp.as_user('insider@grida.co');
SELECT throws_ok(sql, '42501', NULL, 'a project member cannot ' || label)
  FROM ciam_calls ORDER BY label;
SELECT pg_temp.as_nobody();

SET LOCAL ROLE service_role;
-- A fresh challenge, so this does not depend on the denied calls above.
SELECT is(
  (SELECT customer_uid
     FROM grida_ciam_public.verify_customer_otp_and_create_session(
       grida_ciam_public.create_customer_otp_challenge(
         (SELECT project_id FROM fx WHERE tenant = 'insider'),
         'insider-customer@example.com', '000000', 600),
       '000000', 0)),
  (SELECT customer_uid FROM fx WHERE tenant = 'insider'),
  'service_role can verify an OTP challenge'
);
SELECT ok(
  (SELECT token
     FROM grida_ciam_public.create_customer_portal_session(
       (SELECT project_id FROM fx WHERE tenant = 'insider'),
       (SELECT customer_uid FROM fx WHERE tenant = 'insider'))) IS NOT NULL,
  'service_role can mint a portal session'
);
SELECT lives_ok(
  format('SELECT grida_ciam_public.revoke_customer_portal_sessions(%s, %L)',
         (SELECT project_id FROM fx WHERE tenant = 'insider'),
         (SELECT customer_uid FROM fx WHERE tenant = 'insider')),
  'service_role can revoke portal sessions'
);
RESET ROLE;

---------------------------------------------------------------------
-- [helper] grida_commerce.rls_store: member-only definer check
---------------------------------------------------------------------

SELECT ok(
  NOT has_function_privilege('anon', 'grida_commerce.rls_store(bigint)', 'EXECUTE'),
  'anon cannot execute grida_commerce.rls_store(bigint)'
);
SELECT ok(
  NOT EXISTS (
    SELECT 1
      FROM pg_proc p
      CROSS JOIN LATERAL aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) acl
     WHERE p.oid = 'grida_commerce.rls_store(bigint)'::regprocedure
       AND acl.grantee = 0 AND acl.privilege_type = 'EXECUTE'
  ),
  'PUBLIC has no EXECUTE ACL on grida_commerce.rls_store(bigint)'
);

SELECT pg_temp.as_user('insider@grida.co');
SELECT ok(
  grida_commerce.rls_store((SELECT store_id FROM fx WHERE tenant = 'insider')),
  'rls_store grants a member their own store'
);
SELECT ok(
  NOT grida_commerce.rls_store((SELECT store_id FROM fx WHERE tenant = 'alice')),
  'rls_store denies a member another tenant''s store'
);
SELECT pg_temp.as_nobody();

SELECT pg_temp.as_user('random@example.com');
SELECT ok(
  NOT grida_commerce.rls_store((SELECT store_id FROM fx WHERE tenant = 'insider')),
  'rls_store denies a user with no membership'
);
SELECT pg_temp.as_nobody();

SET LOCAL ROLE anon;
SELECT throws_ok(
  format('SELECT grida_commerce.rls_store(%s)', (SELECT store_id FROM fx WHERE tenant = 'insider')),
  '42501', NULL,
  'anon cannot call grida_commerce.rls_store'
);
SELECT pg_temp.as_nobody();

---------------------------------------------------------------------
-- [2]/[3] No open policy or anon grant remains on the repaired tables
---------------------------------------------------------------------

CREATE TEMP TABLE read_targets (tbl text PRIMARY KEY, key_col text, fx_col text);
INSERT INTO read_targets VALUES
  ('grida_forms.attribute', 'id', 'field_id'),
  ('grida_forms.optgroup', 'id', 'optgroup_id'),
  ('grida_forms.option', 'id', 'option_id'),
  ('grida_forms.form_block', 'id', 'block_id'),
  ('grida_forms.form_document', 'id', 'page_id'),
  ('grida_forms.connection_supabase', 'id', 'conn_sb_id'),
  ('grida_forms.connection_commerce_store', 'id', 'conn_store_id'),
  ('grida_forms.schema_document', 'id', 'schema_id'),
  ('grida_commerce.inventory_item', 'id', 'item_id'),
  ('grida_commerce.inventory_level', 'id', 'level_id'),
  ('grida_commerce.inventory_level_commit', 'id', 'commit_id');
GRANT SELECT ON read_targets TO anon, authenticated;

SELECT is(
  (SELECT array_agg(format('%s.%s: %s', schemaname, tablename, policyname) ORDER BY 1)
     FROM pg_policies
    WHERE format('%s.%s', schemaname, tablename) IN (SELECT tbl FROM read_targets)
      AND (roles && ARRAY['public', 'anon']::name[]
           OR qual = 'true' OR with_check = 'true')),
  NULL,
  'no repaired table keeps a PUBLIC/anon or USING(true) policy'
);
SELECT is(
  (SELECT array_agg(format('%s %s', tbl, priv) ORDER BY 1)
     FROM read_targets
     CROSS JOIN unnest(ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE',
                             'TRUNCATE', 'REFERENCES', 'TRIGGER']) priv
    WHERE has_table_privilege('anon', tbl, priv)),
  NULL,
  'anon holds no privilege on the repaired tables'
);
SELECT is(
  (SELECT array_agg(format('%s %s', tbl, priv) ORDER BY 1)
     FROM read_targets
     CROSS JOIN unnest(ARRAY['TRUNCATE', 'REFERENCES', 'TRIGGER']) priv
    WHERE has_table_privilege('authenticated', tbl, priv)),
  NULL,
  'authenticated holds no RLS-bypassing privilege on the repaired tables'
);

---------------------------------------------------------------------
-- Read isolation: insider sees own row; other tenant, no-membership user
-- and anon do not
---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION pg_temp.visible(p_tbl text, p_key text, p_fx text)
RETURNS boolean LANGUAGE plpgsql AS $$
DECLARE v boolean;
BEGIN
  EXECUTE format(
    'SELECT EXISTS (SELECT 1 FROM %s WHERE %I = (SELECT %I FROM fx WHERE tenant = %L))',
    p_tbl, p_key, p_fx, 'insider') INTO v;
  RETURN v;
END;
$$;

SELECT pg_temp.as_user('insider@grida.co');
SELECT ok(pg_temp.visible(tbl, key_col, fx_col), 'insider reads own ' || tbl)
  FROM read_targets ORDER BY tbl;
SELECT pg_temp.as_nobody();

SELECT pg_temp.as_user('alice@acme.com');
SELECT ok(NOT pg_temp.visible(tbl, key_col, fx_col), 'other tenant cannot read ' || tbl)
  FROM read_targets ORDER BY tbl;
SELECT pg_temp.as_nobody();

SELECT pg_temp.as_user('random@example.com');
SELECT ok(NOT pg_temp.visible(tbl, key_col, fx_col), 'no-membership user cannot read ' || tbl)
  FROM read_targets ORDER BY tbl;
SELECT pg_temp.as_nobody();

SET LOCAL ROLE anon;
SELECT throws_ok(format('SELECT 1 FROM %s LIMIT 1', tbl), '42501', NULL, 'anon is denied ' || tbl)
  FROM read_targets ORDER BY tbl;
SELECT pg_temp.as_nobody();

---------------------------------------------------------------------
-- Write isolation: another tenant's UPDATE/DELETE reaches no row
---------------------------------------------------------------------

SELECT pg_temp.as_user('alice@acme.com');
SELECT is(
  pg_temp.affected(format('UPDATE %s SET %I = %I WHERE %I = (SELECT %I FROM fx WHERE tenant = %L)',
                          tbl, key_col, key_col, key_col, fx_col, 'insider')),
  0::bigint,
  'other tenant cannot update ' || tbl
) FROM read_targets ORDER BY tbl;
SELECT is(
  pg_temp.affected(format('DELETE FROM %s WHERE %I = (SELECT %I FROM fx WHERE tenant = %L)',
                          tbl, key_col, fx_col, 'insider')),
  0::bigint,
  'other tenant cannot delete ' || tbl
) FROM read_targets ORDER BY tbl;

---------------------------------------------------------------------
-- Cross-reference writes: a member (alice) inserting/updating rows in her
-- own form cannot point them at insider's objects. FK checks alone would
-- accept every one of these.
---------------------------------------------------------------------

SELECT throws_ok(
  format($q$INSERT INTO grida_forms.attribute (form_id, name) VALUES (%L, 'x')$q$,
         (SELECT form_id FROM fx WHERE tenant = 'insider')),
  '42501', NULL,
  'member cannot add a field to another tenant''s form'
);
SELECT throws_ok(
  format($q$INSERT INTO grida_forms.optgroup (form_id, form_field_id, label) VALUES (%L, %L, 'x')$q$,
         (SELECT form_id FROM fx WHERE tenant = 'alice'),
         (SELECT field_id FROM fx WHERE tenant = 'insider')),
  '42501', NULL,
  'member cannot attach an optgroup to another tenant''s field'
);
SELECT throws_ok(
  format($q$INSERT INTO grida_forms.option (form_id, form_field_id, value) VALUES (%L, %L, 'x')$q$,
         (SELECT form_id FROM fx WHERE tenant = 'alice'),
         (SELECT field_id FROM fx WHERE tenant = 'insider')),
  '42501', NULL,
  'member cannot attach an option to another tenant''s field'
);
SELECT throws_ok(
  format($q$INSERT INTO grida_forms.option (form_id, form_field_id, value, optgroup_id) VALUES (%L, %L, 'x', %L)$q$,
         (SELECT form_id FROM fx WHERE tenant = 'alice'),
         (SELECT field_id FROM fx WHERE tenant = 'alice'),
         (SELECT optgroup_id FROM fx WHERE tenant = 'insider')),
  '42501', NULL,
  'member cannot put an option in another tenant''s optgroup'
);
SELECT throws_ok(
  format($q$INSERT INTO grida_forms.form_block (form_id, form_page_id, type, form_field_id) VALUES (%L, %L, 'field', %L)$q$,
         (SELECT form_id FROM fx WHERE tenant = 'alice'),
         (SELECT page_id FROM fx WHERE tenant = 'alice'),
         (SELECT field_id FROM fx WHERE tenant = 'insider')),
  '42501', NULL,
  'member cannot place another tenant''s field in a block'
);
SELECT throws_ok(
  format($q$INSERT INTO grida_forms.form_block (form_id, form_page_id, type) VALUES (%L, %L, 'divider')$q$,
         (SELECT form_id FROM fx WHERE tenant = 'alice'),
         (SELECT page_id FROM fx WHERE tenant = 'insider')),
  '42501', NULL,
  'member cannot add a block to another tenant''s page'
);
SELECT throws_ok(
  format($q$INSERT INTO grida_forms.form_document (id, form_id, project_id) VALUES (%L, %L, %s)$q$,
         (SELECT spare_doc_id FROM fx WHERE tenant = 'insider'),
         (SELECT form2_id FROM fx WHERE tenant = 'alice'),
         (SELECT project_id FROM fx WHERE tenant = 'alice')),
  '42501', NULL,
  'member cannot claim another tenant''s document as a form page'
);
SELECT throws_ok(
  format($q$INSERT INTO grida_forms.schema_document (id, name, project_id) VALUES (%L, 'claimed', %s)$q$,
         (SELECT spare_doc_id FROM fx WHERE tenant = 'insider'),
         (SELECT project_id FROM fx WHERE tenant = 'alice')),
  '42501', NULL,
  'member cannot claim another tenant''s document as a schema'
);
SELECT throws_ok(
  format($q$UPDATE grida_forms.connection_supabase SET supabase_project_id = %s WHERE id = %s$q$,
         (SELECT sb_project_id FROM fx WHERE tenant = 'insider'),
         (SELECT conn_sb_id FROM fx WHERE tenant = 'alice')),
  '42501', NULL,
  'member cannot connect another tenant''s x-supabase project'
);
SELECT throws_ok(
  format($q$UPDATE grida_forms.connection_supabase SET main_supabase_table_id = %s WHERE id = %s$q$,
         (SELECT sb_table_id FROM fx WHERE tenant = 'insider'),
         (SELECT conn_sb_id FROM fx WHERE tenant = 'alice')),
  '42501', NULL,
  'member cannot connect another tenant''s x-supabase table'
);
-- Submissions would then move the victim's stock.
SELECT throws_ok(
  format($q$UPDATE grida_forms.connection_commerce_store SET store_id = %s WHERE id = %s$q$,
         (SELECT store_id FROM fx WHERE tenant = 'insider'),
         (SELECT conn_store_id FROM fx WHERE tenant = 'alice')),
  '42501', NULL,
  'member cannot connect another tenant''s commerce store'
);
SELECT pg_temp.as_nobody();

---------------------------------------------------------------------
-- Positive writes: the member's own editor paths still work
---------------------------------------------------------------------

SELECT pg_temp.as_user('insider@grida.co');
SELECT lives_ok(
  format($q$INSERT INTO grida_forms.attribute (form_id, name) VALUES (%L, 'extra')$q$,
         (SELECT form_id FROM fx WHERE tenant = 'insider')),
  'member can add a field to their own form'
);
SELECT is(
  pg_temp.affected(format($q$UPDATE grida_forms.attribute SET label = 'renamed' WHERE id = %L$q$,
                          (SELECT field_id FROM fx WHERE tenant = 'insider'))),
  1::bigint,
  'member can update their own field'
);
SELECT lives_ok(
  format($q$INSERT INTO grida_forms.optgroup (form_id, form_field_id, label) VALUES (%L, %L, 'group 2')$q$,
         (SELECT form_id FROM fx WHERE tenant = 'insider'),
         (SELECT field_id FROM fx WHERE tenant = 'insider')),
  'member can add an optgroup to their own field'
);
SELECT lives_ok(
  format($q$INSERT INTO grida_forms.option (form_id, form_field_id, value, optgroup_id) VALUES (%L, %L, 'b', %L)$q$,
         (SELECT form_id FROM fx WHERE tenant = 'insider'),
         (SELECT field_id FROM fx WHERE tenant = 'insider'),
         (SELECT optgroup_id FROM fx WHERE tenant = 'insider')),
  'member can add an option to their own field'
);
SELECT lives_ok(
  format($q$INSERT INTO grida_forms.form_block (form_id, form_page_id, type, form_field_id) VALUES (%L, %L, 'field', %L)$q$,
         (SELECT form_id FROM fx WHERE tenant = 'insider'),
         (SELECT page_id FROM fx WHERE tenant = 'insider'),
         (SELECT field_id FROM fx WHERE tenant = 'insider')),
  'member can add a block to their own page'
);
SELECT is(
  pg_temp.affected(format($q$UPDATE grida_forms.form_block SET local_index = 1 WHERE id = %L$q$,
                          (SELECT block_id FROM fx WHERE tenant = 'insider'))),
  1::bigint,
  'member can update their own block'
);
SELECT is(
  pg_temp.affected(format($q$DELETE FROM grida_forms.form_block WHERE id = %L$q$,
                          (SELECT block_id FROM fx WHERE tenant = 'insider'))),
  1::bigint,
  'member can delete their own block'
);
SELECT lives_ok(
  format($q$INSERT INTO grida_forms.form_document (id, form_id, project_id) VALUES (%L, %L, %s)$q$,
         (SELECT spare_doc_id FROM fx WHERE tenant = 'insider'),
         (SELECT form2_id FROM fx WHERE tenant = 'insider'),
         (SELECT project_id FROM fx WHERE tenant = 'insider')),
  'member can create a page for their own form'
);
SELECT is(
  pg_temp.affected(format($q$UPDATE grida_forms.form_document SET redirect_after_response_uri = 'https://example.com/thanks' WHERE id = %L$q$,
                          (SELECT page_id FROM fx WHERE tenant = 'insider'))),
  1::bigint,
  'member can update their own page settings'
);
SELECT is(
  pg_temp.affected(format($q$UPDATE grida_forms.schema_document SET name = 'insider_renamed' WHERE id = %L$q$,
                          (SELECT schema_id FROM fx WHERE tenant = 'insider'))),
  1::bigint,
  'member can update their own schema'
);
SELECT is(
  pg_temp.affected(format($q$UPDATE grida_forms.connection_supabase SET main_supabase_table_id = %s WHERE id = %s$q$,
                          (SELECT sb_table_id FROM fx WHERE tenant = 'insider'),
                          (SELECT conn_sb_id FROM fx WHERE tenant = 'insider'))),
  1::bigint,
  'member can connect their own x-supabase table'
);
SELECT is(
  pg_temp.affected(format($q$DELETE FROM grida_forms.connection_commerce_store WHERE id = %s$q$,
                          (SELECT conn_store_id FROM fx WHERE tenant = 'insider'))),
  1::bigint,
  'member can disconnect their own store'
);
SELECT lives_ok(
  format($q$INSERT INTO grida_forms.connection_commerce_store (form_id, project_id, store_id) VALUES (%L, %s, %s)$q$,
         (SELECT form_id FROM fx WHERE tenant = 'insider'),
         (SELECT project_id FROM fx WHERE tenant = 'insider'),
         (SELECT store_id FROM fx WHERE tenant = 'insider')),
  'member can connect their own store'
);

---------------------------------------------------------------------
-- Inventory: members read through the editor RPC; writes stay service-only
---------------------------------------------------------------------

SELECT is(
  pg_temp.affected(format('UPDATE %s SET %I = %I WHERE %I = (SELECT %I FROM fx WHERE tenant = %L)',
                          tbl, key_col, key_col, key_col, fx_col, 'insider')),
  0::bigint,
  'member cannot update ' || tbl
) FROM read_targets WHERE tbl LIKE 'grida_commerce.%' ORDER BY tbl;
SELECT is(
  pg_temp.affected(format('DELETE FROM %s WHERE %I = (SELECT %I FROM fx WHERE tenant = %L)',
                          tbl, key_col, fx_col, 'insider')),
  0::bigint,
  'member cannot delete ' || tbl
) FROM read_targets WHERE tbl LIKE 'grida_commerce.%' ORDER BY tbl;

SELECT is(
  (SELECT count(*) FROM grida_commerce.get_inventory_items_with_committed(
     (SELECT store_id FROM fx WHERE tenant = 'insider'))),
  1::bigint,
  'member reads their own inventory through get_inventory_items_with_committed'
);
SELECT pg_temp.as_nobody();

SELECT pg_temp.as_user('alice@acme.com');
SELECT is(
  (SELECT count(*) FROM grida_commerce.get_inventory_items_with_committed(
     (SELECT store_id FROM fx WHERE tenant = 'insider'))),
  0::bigint,
  'other tenant reads no inventory through get_inventory_items_with_committed'
);
SELECT pg_temp.as_nobody();

SELECT * FROM finish();
ROLLBACK;
