create schema if not exists "grida_storage";

CREATE TABLE grida_storage.bucket_document (
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  id UUID NOT NULL,
  name TEXT NOT NULL,
  project_id BIGINT NOT NULL,
  CONSTRAINT bucket_document_id_key UNIQUE (id),
  CONSTRAINT unique_bucket_name_in_project UNIQUE (name, project_id),
  CONSTRAINT bucket_document_id_fkey FOREIGN KEY (id) REFERENCES document(id) ON DELETE CASCADE,
  CONSTRAINT bucket_document_project_id_fkey FOREIGN KEY (project_id) REFERENCES project(id) ON DELETE CASCADE,
  CONSTRAINT bucket_name_check CHECK (name ~ '^[a-zA-Z_][a-zA-Z0-9_]{0,62}$')
);

ALTER TABLE grida_storage.bucket_document ENABLE ROW LEVEL SECURITY;

grant delete on table "grida_storage"."bucket_document" to "anon";

grant insert on table "grida_storage"."bucket_document" to "anon";

grant references on table "grida_storage"."bucket_document" to "anon";

grant select on table "grida_storage"."bucket_document" to "anon";

grant trigger on table "grida_storage"."bucket_document" to "anon";

grant truncate on table "grida_storage"."bucket_document" to "anon";

grant update on table "grida_storage"."bucket_document" to "anon";

grant delete on table "grida_storage"."bucket_document" to "authenticated";

grant insert on table "grida_storage"."bucket_document" to "authenticated";

grant references on table "grida_storage"."bucket_document" to "authenticated";

grant select on table "grida_storage"."bucket_document" to "authenticated";

grant trigger on table "grida_storage"."bucket_document" to "authenticated";

grant truncate on table "grida_storage"."bucket_document" to "authenticated";

grant update on table "grida_storage"."bucket_document" to "authenticated";

grant delete on table "grida_storage"."bucket_document" to "service_role";

grant insert on table "grida_storage"."bucket_document" to "service_role";

grant references on table "grida_storage"."bucket_document" to "service_role";

grant select on table "grida_storage"."bucket_document" to "service_role";

grant trigger on table "grida_storage"."bucket_document" to "service_role";

grant truncate on table "grida_storage"."bucket_document" to "service_role";

grant update on table "grida_storage"."bucket_document" to "service_role";

create policy "based on document access"
on "grida_storage"."bucket_document"
as permissive
for all
to public
using (rls_document(id))
with check (rls_document(id));

alter table "grida_storage"."bucket_document" drop constraint "bucket_name_check";

create table "grida_storage"."objects" (
    "id" uuid not null,
    "bucket_id" uuid not null
);


alter table "grida_storage"."objects" enable row level security;

alter table "grida_storage"."bucket_document" add column "public" boolean not null default false;

CREATE UNIQUE INDEX bucket_document_pkey ON grida_storage.bucket_document USING btree (id);

CREATE UNIQUE INDEX objects_pkey ON grida_storage.objects USING btree (id);

alter table "grida_storage"."bucket_document" add constraint "bucket_document_pkey" PRIMARY KEY using index "bucket_document_pkey";

alter table "grida_storage"."objects" add constraint "objects_pkey" PRIMARY KEY using index "objects_pkey";

alter table "grida_storage"."bucket_document" add constraint "bucket_document_name_check" CHECK ((name ~ '^[a-zA-Z_][a-zA-Z0-9_-]{0,62}$'::text)) not valid;

alter table "grida_storage"."bucket_document" validate constraint "bucket_document_name_check";

alter table "grida_storage"."objects" add constraint "bucket_document_fk" FOREIGN KEY (bucket_id) REFERENCES grida_storage.bucket_document(id) ON DELETE CASCADE not valid;

alter table "grida_storage"."objects" validate constraint "bucket_document_fk";

alter table "grida_storage"."objects" add constraint "objects_id_fkey" FOREIGN KEY (id) REFERENCES storage.objects(id) ON DELETE CASCADE not valid;

alter table "grida_storage"."objects" validate constraint "objects_id_fkey";

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION grida_storage.rls_object_delete_policy(p_object_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
declare
  l_bucket uuid;
begin
  select bucket_id into l_bucket from grida_storage.objects where id = p_object_id;
  return rls_document(l_bucket);
end;
$function$
;

CREATE OR REPLACE FUNCTION grida_storage.rls_object_insert_policy(new_row grida_storage.objects)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
begin
  return rls_document(new_row.bucket_id);
end;
$function$
;

CREATE OR REPLACE FUNCTION grida_storage.rls_object_read_policy(p_object_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
declare
  l_bucket uuid;
  l_public boolean;
begin
  select bucket_id into l_bucket from grida_storage.objects where id = p_object_id;
  select public into l_public from grida_storage.bucket_document where id = l_bucket;
  return l_public or rls_document(l_bucket);
end;
$function$
;

CREATE OR REPLACE FUNCTION grida_storage.rls_object_update_policy(p_object_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
declare
  l_bucket uuid;
begin
  select bucket_id into l_bucket from grida_storage.objects where id = p_object_id;
  return rls_document(l_bucket);
end;
$function$
;

grant delete on table "grida_storage"."objects" to "anon";

grant insert on table "grida_storage"."objects" to "anon";

grant references on table "grida_storage"."objects" to "anon";

grant select on table "grida_storage"."objects" to "anon";

grant trigger on table "grida_storage"."objects" to "anon";

grant truncate on table "grida_storage"."objects" to "anon";

grant update on table "grida_storage"."objects" to "anon";

grant delete on table "grida_storage"."objects" to "authenticated";

grant insert on table "grida_storage"."objects" to "authenticated";

grant references on table "grida_storage"."objects" to "authenticated";

grant select on table "grida_storage"."objects" to "authenticated";

grant trigger on table "grida_storage"."objects" to "authenticated";

grant truncate on table "grida_storage"."objects" to "authenticated";

grant update on table "grida_storage"."objects" to "authenticated";

grant delete on table "grida_storage"."objects" to "service_role";

grant insert on table "grida_storage"."objects" to "service_role";

grant references on table "grida_storage"."objects" to "service_role";

grant select on table "grida_storage"."objects" to "service_role";

grant trigger on table "grida_storage"."objects" to "service_role";

grant truncate on table "grida_storage"."objects" to "service_role";

grant update on table "grida_storage"."objects" to "service_role";

create policy "rls_object_delete_policy"
on "grida_storage"."objects"
as permissive
for delete
to public
using (grida_storage.rls_object_delete_policy(id));


create policy "rls_object_insert_policy"
on "grida_storage"."objects"
as permissive
for insert
to public
with check (grida_storage.rls_object_insert_policy(ROW(id, bucket_id)::grida_storage.objects));


create policy "rls_object_read_policy"
on "grida_storage"."objects"
as permissive
for select
to public
using (grida_storage.rls_object_read_policy(id));


create policy "rls_object_update_policy"
on "grida_storage"."objects"
as permissive
for update
to public
using (grida_storage.rls_object_update_policy(id))
with check (grida_storage.rls_object_update_policy(id));



drop function if exists "public"."workspace_documents"(p_organization_id bigint);

alter type "public"."doctype" rename to "doctype__old_version_to_be_dropped";

create type "public"."doctype" as enum ('v0_form', 'v0_site', 'v0_schema', 'v0_canvas', 'v0_bucket');

alter table "public"."document" alter column doctype type "public"."doctype" using doctype::text::"public"."doctype";

drop type "public"."doctype__old_version_to_be_dropped";

set check_function_bodies = off;

create or replace view "public"."dummy_with_user" as  SELECT d.id,
    d.created_at,
    d.text,
    d.user_id,
    d.data,
    d.enum,
    d.int2,
    d.int4,
    d.float4,
    d.float8,
    d."numeric",
    d.jsonb,
    d."varchar",
    d.richtext,
    d.timestamptz,
    u.email
   FROM (dummy d
     LEFT JOIN auth.users u ON ((d.user_id = u.id)));


CREATE OR REPLACE FUNCTION public.workspace_documents(p_organization_id bigint)
 RETURNS TABLE(id uuid, created_at timestamp with time zone, updated_at timestamp with time zone, doctype doctype, project_id bigint, title text, form_id uuid, organization_id bigint, has_connection_supabase boolean, responses bigint, max_responses bigint, is_public boolean)
 LANGUAGE plpgsql
AS $function$
BEGIN
    RETURN QUERY
    SELECT 
        d.id,
        d.created_at,
        d.updated_at,
        d.doctype,
        d.project_id,
        d.title,
        fd.form_id,
        p.organization_id,
        cs.id IS NOT NULL,
        COALESCE(
            (SELECT COUNT(*) FROM grida_forms.response r WHERE r.form_id = fd.form_id), 
            0
        ),
        f.max_form_responses_in_total,
        bd.public
    FROM 
        public.document d
    LEFT JOIN 
        grida_forms.form_document fd ON d.id = fd.id
    LEFT JOIN 
        public.project p ON d.project_id = p.id
    LEFT JOIN 
        grida_forms.connection_supabase cs ON fd.form_id = cs.form_id
    LEFT JOIN 
        grida_forms.form f ON fd.form_id = f.id
    LEFT JOIN
        grida_storage.bucket_document bd ON d.id = bd.id
    WHERE 
        p.organization_id = p_organization_id;
END;
$function$
;
