create extension if not exists vector with schema extensions;

-- add `priority` column
ALTER TABLE grida_library.object
ADD COLUMN priority INT;


---------------------------------------------------------------------
-- [Embedding - Vision Support - clip-vit-large-patch14] --
---------------------------------------------------------------------
create table grida_library.object_embedding_clip_l14 (
  object_id uuid primary key references grida_library.object(id) on delete cascade,
  embedding vector(768),
  created_at timestamptz default now()
);

ALTER TABLE grida_library.object_embedding_clip_l14 ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public_read" ON grida_library.object_embedding_clip_l14 FOR SELECT TO public USING (true);


---------------------------------------------------------------------
-- [similar rpc] --
---------------------------------------------------------------------
create or replace function grida_library.similar(
  ref_id uuid
)
returns setof grida_library.object
language sql
stable
as $$
  with reference as (
    select embedding
    from grida_library.object_embedding_clip_l14
    where object_id = ref_id
  )
  select o.*
  from grida_library.object o
  join grida_library.object_embedding_clip_l14 e on e.object_id = o.id,
       reference r
  where o.id <> ref_id and e.embedding is not null
  order by e.embedding <#> r.embedding;
$$;