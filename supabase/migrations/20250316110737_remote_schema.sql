create extension if not exists "citext" with schema "public" version '1.6';

CREATE DOMAIN email AS citext
  CHECK (
    VALUE ~ '^[a-zA-Z0-9.!#$%&''*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$'
  );

CREATE DOMAIN phone AS citext
  CHECK (
    VALUE ~ '^\+[1-9][0-9]{7,14}$'
  );

create type "public"."pricing_tier" as enum ('free', 'v0_pro', 'v0_team', 'v0_enterprise');

alter table "public"."customer" add column "description" text;

alter table "public"."customer" add column "metadata" jsonb;

alter table "public"."customer" add column "name" text;

alter table "public"."customer" alter column "email" set data type email using "email"::email;

alter table "public"."customer" alter column "phone" set data type phone using "phone"::phone;

alter table "public"."organization" add column "display_plan" pricing_tier not null default 'free'::pricing_tier;

alter table "public"."customer" add constraint "metadata_must_be_object" CHECK ((jsonb_typeof(metadata) = 'object'::text)) not valid;

alter table "public"."customer" validate constraint "metadata_must_be_object";

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.normalize_email()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF NEW.email IS NOT NULL THEN
    NEW.email := lower(NEW.email);
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.prevent_owner_deletion_from_organization_member()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_owner uuid;
BEGIN
  SELECT owner_id INTO v_owner FROM organization WHERE id = OLD.organization_id;
  IF OLD.user_id = v_owner THEN
    RAISE EXCEPTION 'Cannot delete organization owner.';
  END IF;
  RETURN OLD;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.rls_organization_owner(p_organization_id bigint)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE
AS $function$
DECLARE
  v_owner uuid;
BEGIN
  SELECT owner_id INTO v_owner
  FROM public.organization
  WHERE id = p_organization_id;
  
  RETURN v_owner = auth.uid();
END;
$function$
;

create policy "Allow customer update with project membership"
on "public"."customer"
as permissive
for update
to public
using (rls_project(project_id))
with check (rls_project(project_id));


create policy "Allow insert based on project membership"
on "public"."customer"
as permissive
for insert
to public
with check (rls_project(project_id));


create policy "Enable delete for organization owner"
on "public"."organization_member"
as permissive
for delete
to public
using (rls_organization_owner(organization_id));


CREATE TRIGGER normalize_customer_email BEFORE INSERT OR UPDATE ON public.customer FOR EACH ROW EXECUTE FUNCTION normalize_email();

CREATE TRIGGER trg_prevent_owner_deletion BEFORE DELETE ON public.organization_member FOR EACH ROW EXECUTE FUNCTION prevent_owner_deletion_from_organization_member();


