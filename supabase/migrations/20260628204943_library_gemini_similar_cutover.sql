---------------------------------------------------------------------
-- [similar rpc — cutover to Gemini image embedding] --
--
-- Repoints similar() from the legacy Titan `embedding` (vector_l2_ops
-- ivfflat, queried with <#>) to `gemini_embedding_2__image` (cosine).
--
-- CUTOVER migration: apply ONLY after gemini_embedding_2__image is
-- backfilled & verified. Until applied, the legacy similar() over
-- `embedding` stays live; reverting this migration restores it instantly
-- (the legacy column is still present until the later drop migration).
--
-- Fixes the legacy opclass/operator MISMATCH: the new index is
-- vector_cosine_ops and this RPC queries with `<=>`, so the HNSW index
-- actually serves the ORDER BY (the old <#> never matched vector_l2_ops).
---------------------------------------------------------------------
create or replace function grida_library.similar(
  ref_id uuid
)
returns setof grida_library.object
language sql
stable
as $$
  with reference as (
    select gemini_embedding_2__image as v
    from grida_library.object_embedding
    where object_id = ref_id
  )
  select o.*
  from grida_library.object o
  join grida_library.object_embedding e on e.object_id = o.id,
       reference r
  where o.id <> ref_id
    and e.gemini_embedding_2__image is not null
    and r.v is not null
  order by e.gemini_embedding_2__image <=> r.v, o.id asc;  -- o.id = stable tiebreaker
$$;
