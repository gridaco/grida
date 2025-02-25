drop policy "Enable slect for users based on user_id" on "public"."organization_member";

alter table "public"."organization_member" add constraint "organization_member_user_profile_fkey" FOREIGN KEY (user_id) REFERENCES user_profile(uid) ON DELETE CASCADE not valid;

alter table "public"."organization_member" validate constraint "organization_member_user_profile_fkey";

create policy "Enable read for members"
on "public"."organization_member"
as permissive
for select
to public
using (rls_organization(organization_id));



