CREATE POLICY "Projects can be deleted by authorized users"
  ON public.project
  FOR DELETE
  USING (rls_project(id));