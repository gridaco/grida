-- Role-contract repair for three legacy surfaces.
--
-- 1. grida_ciam_public: the OTP/portal-session minting RPCs are service-only.
--    Every app caller uses the service_role client; the challenge/verify
--    routes own OTP generation and delivery. Explicit anon/authenticated
--    grants (and PostgreSQL's default PUBLIC EXECUTE) let a direct RPC caller
--    mint a challenge with a caller-chosen OTP or a portal session for any
--    customer. Bearer-token RPCs (redeem/touch) stay public by design.
--
-- 2. grida_forms: the 2025-02 remote-schema dump left `USING (true)` policies
--    (marked REMOVEME/FIXME) on editor-owned tables. The 2025-04 repair only
--    covered response/response_field/response_session. Public form rendering
--    and submission read these tables through service_role; the only
--    non-service callers are signed-in project members in the editor.
--
-- 3. grida_commerce: inventory reads were open to every authenticated user
--    (inventory_level_commit to every role). The editor reads inventory as a
--    project member; all inventory writes go through service_role.
--
-- Cross-reference checks in WITH CHECK keep a member from attaching their
-- rows to another tenant's field, optgroup, page, document, store or
-- x-supabase project/table (FK checks alone do not respect RLS).

BEGIN;

-- The forms tables serve live form traffic; fail fast rather than queue
-- reads behind a policy lock.
SET LOCAL lock_timeout = '5s';

---------------------------------------------------------------------
-- [1] grida_ciam_public — service-only RPCs
---------------------------------------------------------------------

REVOKE ALL ON FUNCTION
  grida_ciam_public.create_customer_otp_challenge(bigint, text, text, integer),
  grida_ciam_public.verify_customer_otp_and_create_session(uuid, text, integer),
  grida_ciam_public.create_customer_portal_session(bigint, uuid, integer, integer, text[]),
  grida_ciam_public.revoke_customer_portal_sessions(bigint, uuid)
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION
  grida_ciam_public.create_customer_otp_challenge(bigint, text, text, integer),
  grida_ciam_public.verify_customer_otp_and_create_session(uuid, text, integer),
  grida_ciam_public.create_customer_portal_session(bigint, uuid, integer, integer, text[]),
  grida_ciam_public.revoke_customer_portal_sessions(bigint, uuid)
TO service_role;

---------------------------------------------------------------------
-- [helper] grida_commerce.rls_store
-- `store` has no member-facing policy, so policies that must resolve a
-- store's project go through this definer check (mirrors rls_form).
---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION grida_commerce.rls_store(p_store_id bigint)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM grida_commerce.store s
     WHERE s.id = p_store_id
       AND public.rls_project(s.project_id)
  );
$$;

REVOKE ALL ON FUNCTION grida_commerce.rls_store(bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION grida_commerce.rls_store(bigint) TO authenticated, service_role;

---------------------------------------------------------------------
-- [2] grida_forms — drop open policies, scope to project members
---------------------------------------------------------------------

DROP POLICY IF EXISTS "Enable access for all users" ON grida_forms.attribute;
DROP POLICY IF EXISTS "Enable update for all" ON grida_forms.attribute;
DROP POLICY IF EXISTS "FIXME: enable all" ON grida_forms.optgroup;
DROP POLICY IF EXISTS "FIXME: Enable all access for all users" ON grida_forms.option;
DROP POLICY IF EXISTS "REMOVEME - Allow All" ON grida_forms.form_block;
DROP POLICY IF EXISTS "REMOVEME: Enable all access for all users" ON grida_forms.form_document;
DROP POLICY IF EXISTS "REMOVEME: allow all" ON grida_forms.connection_supabase;
DROP POLICY IF EXISTS "REMOVEME: allow all" ON grida_forms.connection_commerce_store;
DROP POLICY IF EXISTS "REMOVEME: allow all for all users" ON grida_forms.schema_document;

-- Replacements below; dropped first so the migration can be re-applied.
DROP POLICY IF EXISTS "access with form access" ON grida_forms.attribute;
DROP POLICY IF EXISTS "access with form access" ON grida_forms.optgroup;
DROP POLICY IF EXISTS "access with form access" ON grida_forms.option;
DROP POLICY IF EXISTS "access with form access" ON grida_forms.form_block;
DROP POLICY IF EXISTS "access with project membership" ON grida_forms.form_document;
DROP POLICY IF EXISTS "access with form access" ON grida_forms.connection_supabase;
DROP POLICY IF EXISTS "access with form access" ON grida_forms.connection_commerce_store;
DROP POLICY IF EXISTS "access with project membership" ON grida_forms.schema_document;

-- No anonymous caller exists for these tables. TRUNCATE/TRIGGER/REFERENCES
-- bypass or sidestep RLS and have no member use either.
REVOKE ALL ON TABLE
  grida_forms.attribute,
  grida_forms.optgroup,
  grida_forms.option,
  grida_forms.form_block,
  grida_forms.form_document,
  grida_forms.connection_supabase,
  grida_forms.connection_commerce_store,
  grida_forms.schema_document
FROM anon;

REVOKE TRUNCATE, TRIGGER, REFERENCES ON TABLE
  grida_forms.attribute,
  grida_forms.optgroup,
  grida_forms.option,
  grida_forms.form_block,
  grida_forms.form_document,
  grida_forms.connection_supabase,
  grida_forms.connection_commerce_store,
  grida_forms.schema_document
FROM authenticated;

CREATE POLICY "access with form access"
ON grida_forms.attribute
FOR ALL
TO authenticated
USING (grida_forms.rls_form(form_id))
WITH CHECK (grida_forms.rls_form(form_id));

CREATE POLICY "access with form access"
ON grida_forms.optgroup
FOR ALL
TO authenticated
USING (grida_forms.rls_form(form_id))
WITH CHECK (
  grida_forms.rls_form(form_id)
  AND EXISTS (
    SELECT 1 FROM grida_forms.attribute a
     WHERE a.id = optgroup.form_field_id
       AND a.form_id = optgroup.form_id
  )
);

CREATE POLICY "access with form access"
ON grida_forms.option
FOR ALL
TO authenticated
USING (grida_forms.rls_form(form_id))
WITH CHECK (
  grida_forms.rls_form(form_id)
  AND EXISTS (
    SELECT 1 FROM grida_forms.attribute a
     WHERE a.id = option.form_field_id
       AND a.form_id = option.form_id
  )
  AND (
    option.optgroup_id IS NULL
    OR EXISTS (
      SELECT 1 FROM grida_forms.optgroup g
       WHERE g.id = option.optgroup_id
         AND g.form_id = option.form_id
    )
  )
);

-- parent_id is not cross-checked: a self-referencing policy would recurse,
-- and blocks are always loaded by their own form_id.
CREATE POLICY "access with form access"
ON grida_forms.form_block
FOR ALL
TO authenticated
USING (grida_forms.rls_form(form_id))
WITH CHECK (
  grida_forms.rls_form(form_id)
  AND (
    form_block.form_field_id IS NULL
    OR EXISTS (
      SELECT 1 FROM grida_forms.attribute a
       WHERE a.id = form_block.form_field_id
         AND a.form_id = form_block.form_id
    )
  )
  AND (
    form_block.form_page_id IS NULL
    OR EXISTS (
      SELECT 1 FROM grida_forms.form_document d
       WHERE d.id = form_block.form_page_id
         AND d.form_id = form_block.form_id
    )
  )
);

CREATE POLICY "access with project membership"
ON grida_forms.form_document
FOR ALL
TO authenticated
USING (public.rls_project(project_id))
WITH CHECK (
  public.rls_project(project_id)
  AND EXISTS (
    SELECT 1 FROM grida_forms.form f
     WHERE f.id = form_document.form_id
       AND f.project_id = form_document.project_id
  )
  AND EXISTS (
    SELECT 1 FROM public.document doc
     WHERE doc.id = form_document.id
       AND doc.project_id = form_document.project_id
  )
);

CREATE POLICY "access with form access"
ON grida_forms.connection_supabase
FOR ALL
TO authenticated
USING (grida_forms.rls_form(form_id))
WITH CHECK (
  grida_forms.rls_form(form_id)
  AND EXISTS (
    SELECT 1
      FROM grida_x_supabase.supabase_project sp
      JOIN grida_forms.form f ON f.project_id = sp.project_id
     WHERE sp.id = connection_supabase.supabase_project_id
       AND f.id = connection_supabase.form_id
  )
  AND (
    connection_supabase.main_supabase_table_id IS NULL
    OR EXISTS (
      SELECT 1 FROM grida_x_supabase.supabase_table t
       WHERE t.id = connection_supabase.main_supabase_table_id
         AND t.supabase_project_id = connection_supabase.supabase_project_id
    )
  )
);

CREATE POLICY "access with form access"
ON grida_forms.connection_commerce_store
FOR ALL
TO authenticated
USING (grida_forms.rls_form(form_id))
WITH CHECK (
  grida_forms.rls_form(form_id)
  AND grida_commerce.rls_store(store_id)
  AND EXISTS (
    SELECT 1 FROM grida_forms.form f
     WHERE f.id = connection_commerce_store.form_id
       AND f.project_id = connection_commerce_store.project_id
  )
);

CREATE POLICY "access with project membership"
ON grida_forms.schema_document
FOR ALL
TO authenticated
USING (public.rls_project(project_id))
WITH CHECK (
  public.rls_project(project_id)
  AND EXISTS (
    SELECT 1 FROM public.document doc
     WHERE doc.id = schema_document.id
       AND doc.project_id = schema_document.project_id
  )
);

---------------------------------------------------------------------
-- [3] grida_commerce — inventory reads scoped to the store's project
---------------------------------------------------------------------

DROP POLICY IF EXISTS "REMOVEME: allow read for all" ON grida_commerce.inventory_item;
DROP POLICY IF EXISTS "REMOVEME: allow read for all" ON grida_commerce.inventory_level;
DROP POLICY IF EXISTS "Enable read access for all users" ON grida_commerce.inventory_level_commit;
DROP POLICY IF EXISTS "read with store access" ON grida_commerce.inventory_item;
DROP POLICY IF EXISTS "read with store access" ON grida_commerce.inventory_level;
DROP POLICY IF EXISTS "read with store access" ON grida_commerce.inventory_level_commit;

REVOKE ALL ON TABLE
  grida_commerce.inventory_item,
  grida_commerce.inventory_level,
  grida_commerce.inventory_level_commit
FROM anon;

REVOKE TRUNCATE, TRIGGER, REFERENCES ON TABLE
  grida_commerce.inventory_item,
  grida_commerce.inventory_level,
  grida_commerce.inventory_level_commit
FROM authenticated;

CREATE POLICY "read with store access"
ON grida_commerce.inventory_item
FOR SELECT
TO authenticated
USING (grida_commerce.rls_store(store_id));

CREATE POLICY "read with store access"
ON grida_commerce.inventory_level
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM grida_commerce.inventory_item i
     WHERE i.id = inventory_level.inventory_item_id
       AND grida_commerce.rls_store(i.store_id)
  )
);

CREATE POLICY "read with store access"
ON grida_commerce.inventory_level_commit
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
      FROM grida_commerce.inventory_level l
      JOIN grida_commerce.inventory_item i ON i.id = l.inventory_item_id
     WHERE l.id = inventory_level_commit.inventory_level_id
       AND grida_commerce.rls_store(i.store_id)
  )
);

---------------------------------------------------------------------
-- Post-conditions. Permissive policies are OR-ed and grants are additive,
-- so one leftover (e.g. drift from a dashboard edit) silently reopens a
-- surface. Abort the whole migration instead of committing a partial fix.
---------------------------------------------------------------------

DO $$
DECLARE
  v_leftover text;
BEGIN
  SELECT string_agg(format('%s.%s', n.nspname, c.relname), ', ')
    INTO v_leftover
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE (n.nspname, c.relname) IN (
           ('grida_forms', 'attribute'), ('grida_forms', 'optgroup'),
           ('grida_forms', 'option'), ('grida_forms', 'form_block'),
           ('grida_forms', 'form_document'), ('grida_forms', 'connection_supabase'),
           ('grida_forms', 'connection_commerce_store'), ('grida_forms', 'schema_document'),
           ('grida_commerce', 'inventory_item'), ('grida_commerce', 'inventory_level'),
           ('grida_commerce', 'inventory_level_commit'))
     AND NOT c.relrowsecurity;
  IF v_leftover IS NOT NULL THEN
    RAISE EXCEPTION 'RLS is disabled on: %', v_leftover;
  END IF;

  SELECT string_agg(format('%s.%s "%s"', schemaname, tablename, policyname), ', ')
    INTO v_leftover
    FROM pg_policies
   WHERE (schemaname, tablename) IN (
           ('grida_forms', 'attribute'), ('grida_forms', 'optgroup'),
           ('grida_forms', 'option'), ('grida_forms', 'form_block'),
           ('grida_forms', 'form_document'), ('grida_forms', 'connection_supabase'),
           ('grida_forms', 'connection_commerce_store'), ('grida_forms', 'schema_document'),
           ('grida_commerce', 'inventory_item'), ('grida_commerce', 'inventory_level'),
           ('grida_commerce', 'inventory_level_commit'))
     AND (roles && ARRAY['public', 'anon']::name[]
          OR qual = 'true' OR with_check = 'true');
  IF v_leftover IS NOT NULL THEN
    RAISE EXCEPTION 'open policy survived: %', v_leftover;
  END IF;

  -- Every overload, not just the four signatures revoked above.
  SELECT string_agg(p.oid::regprocedure::text, ', ')
    INTO v_leftover
    FROM pg_proc p
   WHERE p.pronamespace = 'grida_ciam_public'::regnamespace
     AND p.proname IN ('create_customer_otp_challenge',
                       'verify_customer_otp_and_create_session',
                       'create_customer_portal_session',
                       'revoke_customer_portal_sessions')
     AND (has_function_privilege('anon', p.oid, 'EXECUTE')
          OR has_function_privilege('authenticated', p.oid, 'EXECUTE'));
  IF v_leftover IS NOT NULL THEN
    RAISE EXCEPTION 'service-only CIAM RPC still callable by anon/authenticated: %', v_leftover;
  END IF;
END $$;

COMMIT;
