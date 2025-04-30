
-- rename select, insert, delete
DROP POLICY IF EXISTS "Allow insert based on membership" ON public.project;
DROP POLICY IF EXISTS "select_project" ON public.project;
DROP POLICY IF EXISTS "Projects can be deleted by authorized users" ON public.project;


CREATE POLICY "Allow insert based on organization membership" ON public.project FOR INSERT WITH CHECK (public.rls_organization(organization_id));
CREATE POLICY "Allow select based on project access" ON public.project FOR SELECT USING (public.rls_project(id));
CREATE POLICY "Allow delete based on project access" ON public.project FOR DELETE USING (rls_project(id));

-- create policy for update
CREATE POLICY "Allow update based on project access" ON public.project FOR UPDATE USING (rls_project(id)) WITH CHECK (rls_project(id));
