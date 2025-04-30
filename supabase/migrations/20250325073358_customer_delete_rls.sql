create policy "Allow delete based on project membership"
on "public"."customer"
as PERMISSIVE
for DELETE
to public
using (public.rls_project(project_id));