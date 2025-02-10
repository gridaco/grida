
-- [Grida Storage Schema]
CREATE SCHEMA IF NOT EXISTS "grida_storage";
ALTER SCHEMA "grida_storage" OWNER TO "postgres";


GRANT USAGE ON SCHEMA grida_storage TO anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA grida_storage TO anon, authenticated, service_role;
GRANT ALL ON ALL ROUTINES IN SCHEMA grida_storage TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA grida_storage TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA grida_storage GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA grida_storage GRANT ALL ON ROUTINES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA grida_storage GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;

-- [Bucket Document]

create table
  grida_storage.bucket_document (
    created_at timestamp with time zone not null default now(),
    id uuid not null,
    name text not null,
    project_id bigint not null,
    public boolean not null default false,
    constraint bucket_document_pkey primary key (id),
    constraint bucket_document_id_key unique (id),
    constraint unique_bucket_name_in_project unique (name, project_id),
    constraint bucket_document_id_fkey foreign key (id) references document (id) on delete cascade,
    constraint bucket_document_project_id_fkey foreign key (project_id) references project (id) on delete cascade,
    constraint bucket_document_name_check check ((name ~ '^[a-zA-Z_][a-zA-Z0-9_-]{0,62}$'::text))
  ) tablespace pg_default;


ALTER TABLE grida_storage.bucket_document ENABLE ROW LEVEL SECURITY;

-- RLS
CREATE POLICY "access_based_on_project_membership" ON grida_storage.bucket_document USING (public.rls_document(id));


-- [Bucket Policy]

-- "storage-public" bucket
create policy "Enforce RLS on storage-public bucket"
on storage.objects
for all
using (
  bucket_id = 'storage-public' 
  and rls_document((storage.foldername(name))[1]::uuid)
)
with check (
  bucket_id = 'storage-public' 
  and rls_document((storage.foldername(name))[1]::uuid)
);

-- "storage" bucket
create policy "Enforce RLS on storage bucket"
on storage.objects
for all
using (
  bucket_id = 'storage'
  and rls_document((storage.foldername(name))[1]::uuid)
)
with check (
  bucket_id = 'storage'
  and rls_document((storage.foldername(name))[1]::uuid)
);
