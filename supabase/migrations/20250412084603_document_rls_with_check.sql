-- Drop the old policy
DROP POLICY IF EXISTS "access_based_on_project_membership" ON public.document;

-- Recreate with the new USING + WITH CHECK
CREATE POLICY "access_based_on_project_membership" ON public.document USING (public.rls_document(id)) WITH CHECK (public.rls_project(project_id));