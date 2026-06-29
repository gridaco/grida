---------------------------------------------------------------------
-- [Gemini cutover + drop legacy Titan] --
--
-- Final step of the Titan -> Gemini Embedding 2 migration. The gemini
-- columns are backfilled & verified on prod, so this migration:
--
--   1. repoints similar() from the legacy Titan `embedding` (vector_l2_ops
--      ivfflat, queried with <#>) to `gemini_embedding_2__image` (cosine).
--   2. drops the legacy `embedding` column and its ivfflat index.
--
-- After this, `object_embedding` holds only the two gemini vectors and the
-- library has no remaining Titan references.
--
-- NOTE: the 28 image/svg+xml objects have a Titan vector but no gemini
-- vector (Gemini rejects raw SVG; they were never re-rasterized). They drop
-- out of similar() here by design — accepted.
---------------------------------------------------------------------

-- pgvector's `vector` type and `<=>` operator live in the `extensions`
-- schema, which is NOT on the search_path `supabase db push` uses on the
-- hosted project. Put it on the path so the bare references below resolve
-- (same lesson as 20260628204807 — without this, db push fails with
-- `type "vector" does not exist`).
set search_path = extensions, public;

---------------------------------------------------------------------
-- [similar rpc — cutover to Gemini image embedding] --
--
-- Fixes the legacy opclass/operator MISMATCH along the way: the gemini
-- index is vector_cosine_ops and this RPC queries with `<=>`, so the HNSW
-- index actually serves the ORDER BY (the old <#> never matched the legacy
-- vector_l2_ops ivfflat index).
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

---------------------------------------------------------------------
-- [drop legacy Titan] --
--
-- Drop the ivfflat index first, then the column (dropping the column would
-- cascade to the index anyway; explicit is clearer). Nothing references
-- `embedding` after the similar() cutover above.
---------------------------------------------------------------------
drop index if exists grida_library.object_embedding_ivfflat_idx;

alter table grida_library.object_embedding
  drop column if exists embedding;
