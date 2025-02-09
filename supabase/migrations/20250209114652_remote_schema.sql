create policy "Allow read if the template is public 1scojuy_0"
on "storage"."objects"
as permissive
for select
to public
using (((bucket_id = 'grida-forms-template'::text) AND (((storage.foldername(name))[0])::integer IN ( SELECT form_template.id
   FROM grida_forms.form_template
  WHERE (form_template.is_public = true)))));


create policy "Allow upload to authenticated users vsmf25_0"
on "storage"."objects"
as permissive
for insert
to authenticated
with check ((bucket_id = 'grida-forms'::text));


create policy "Allow upload to authenticated users vsmf25_1"
on "storage"."objects"
as permissive
for update
to authenticated
using ((bucket_id = 'grida-forms'::text));


create policy "FIXME: Give users authenticated access to folder 9jrioh_0"
on "storage"."objects"
as permissive
for select
to public
using (((bucket_id = 'grida-forms-response'::text) AND (auth.role() = 'authenticated'::text)));


create policy "REMOVEME: allow select for all authenticated users vsmf25_0"
on "storage"."objects"
as permissive
for select
to public
using ((bucket_id = 'grida-forms'::text));


create policy "allow read with asset access 1bqp9qb_0"
on "storage"."objects"
as permissive
for select
to public
using (((bucket_id = 'assets'::text) AND rls_asset((name)::uuid)));


create policy "allow write with asset access 1bqp9qb_0"
on "storage"."objects"
as permissive
for insert
to public
with check (((bucket_id = 'assets'::text) AND rls_asset((name)::uuid)));


create policy "allow write with asset access 1bqp9qb_1"
on "storage"."objects"
as permissive
for update
to public
using (((bucket_id = 'assets'::text) AND rls_asset((name)::uuid)));


create policy "allow write with asset access 1bqp9qb_2"
on "storage"."objects"
as permissive
for delete
to public
using (((bucket_id = 'assets'::text) AND rls_asset((name)::uuid)));


create policy "allow write with asset access za60j_0"
on "storage"."objects"
as permissive
for insert
to public
with check (((bucket_id = 'assets-public'::text) AND rls_asset((name)::uuid)));


create policy "allow write with asset access za60j_1"
on "storage"."objects"
as permissive
for update
to public
using (((bucket_id = 'assets-public'::text) AND rls_asset((name)::uuid)));


create policy "allow write with asset access za60j_2"
on "storage"."objects"
as permissive
for delete
to public
using (((bucket_id = 'assets-public'::text) AND rls_asset((name)::uuid)));


CREATE TRIGGER after_object_insert AFTER INSERT ON storage.objects FOR EACH ROW WHEN (((new.bucket_id = 'assets'::text) OR (new.bucket_id = 'assets-public'::text))) EXECUTE FUNCTION update_asset_object_id();


