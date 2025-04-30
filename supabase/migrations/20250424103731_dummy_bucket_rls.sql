create policy "allow all 1l4gbs_0"
on "storage"."objects"
as permissive
for insert
to public
with check ((bucket_id = 'dummy'::text));


create policy "allow all 1l4gbs_1"
on "storage"."objects"
as permissive
for update
to public
using ((bucket_id = 'dummy'::text));


create policy "allow all 1l4gbs_2"
on "storage"."objects"
as permissive
for delete
to public
using ((bucket_id = 'dummy'::text));


create policy "allow all 1l4gbs_3"
on "storage"."objects"
as permissive
for select
to public
using ((bucket_id = 'dummy'::text));



