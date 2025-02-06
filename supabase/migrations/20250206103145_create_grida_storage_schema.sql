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