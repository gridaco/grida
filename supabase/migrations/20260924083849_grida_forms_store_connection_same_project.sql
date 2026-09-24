-- Follow-up to 20260924045429_grida_ciam_forms_commerce_grants.
--
-- A form's commerce store must belong to the form's own project. The
-- previous WITH CHECK only required the member to have access to the store's
-- project, so a user in two projects could pair one project's form with the
-- other project's store. The link outlives that membership, and public
-- submissions to the form (service_role) keep moving the other store's stock.
-- The editor only ever connects a store it creates in the form's project.

BEGIN;

SET LOCAL lock_timeout = '5s';

-- `store` has no member-facing policy; like rls_store, this definer check
-- answers only for projects the caller belongs to, so it cannot be used to
-- probe which project owns an arbitrary store.
CREATE OR REPLACE FUNCTION grida_commerce.rls_store_in_project(p_store_id bigint, p_project_id bigint)
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
       AND s.project_id = p_project_id
       AND public.rls_project(s.project_id)
  );
$$;

REVOKE ALL ON FUNCTION grida_commerce.rls_store_in_project(bigint, bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION grida_commerce.rls_store_in_project(bigint, bigint) TO authenticated, service_role;

DROP POLICY IF EXISTS "access with form access" ON grida_forms.connection_commerce_store;

CREATE POLICY "access with form access"
ON grida_forms.connection_commerce_store
FOR ALL
TO authenticated
USING (grida_forms.rls_form(form_id))
WITH CHECK (
  grida_forms.rls_form(form_id)
  AND grida_commerce.rls_store_in_project(store_id, project_id)
  AND EXISTS (
    SELECT 1 FROM grida_forms.form f
     WHERE f.id = connection_commerce_store.form_id
       AND f.project_id = connection_commerce_store.project_id
  )
);

COMMIT;
