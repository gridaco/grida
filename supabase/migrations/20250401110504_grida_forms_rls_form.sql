-- Function: rls_form
-- Purpose: Row-Level Security helper to authorize access to a form via its project_id.
-- Internally uses rls_project(project_id) for multi-tenant project scoping.
CREATE OR REPLACE FUNCTION grida_forms.rls_form(p_form_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT public.rls_project(project_id)
  FROM grida_forms.form
  WHERE id = p_form_id
$$;