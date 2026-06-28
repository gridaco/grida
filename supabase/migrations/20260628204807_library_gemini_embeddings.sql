---------------------------------------------------------------------
-- [Gemini Embedding 2 — additive] --
--
-- Replaces the legacy Titan image embedding (`embedding vector(1024)`)
-- with two NEW single-modality vectors (1536-dim, cosine), never fused:
--
--   gemini_embedding_2__image  -- image embedding; powers similar() (image<->image)
--   gemini_embedding_2__text   -- embeds title+description+keywords;
--                                 powers search() (text<->text) + cross-modal floor
--
-- This migration is ADDITIVE ONLY. The legacy `embedding` column, its
-- ivfflat index, and the existing similar() over it remain untouched and
-- live. Cutover (repointing similar() to the new column) is a SEPARATE
-- migration applied only after the new columns are backfilled & verified.
---------------------------------------------------------------------

-- `vector` type already installed in schema `extensions` (on search_path);
-- referenced bare, matching the existing library migrations.
ALTER TABLE grida_library.object_embedding
  ADD COLUMN gemini_embedding_2__image vector(1536),  -- NOT NULL deferred to post-backfill
  ADD COLUMN gemini_embedding_2__text  vector(1536);  -- NULLABLE: only described objects

---------------------------------------------------------------------
-- [Indexes — HNSW + cosine] --
--
-- HNSW (first use in this repo; pgvector >= 0.5) with `vector_cosine_ops`
-- paired with the `<=>` operator the RPCs use. This deliberately does NOT
-- repeat the legacy bug where a `vector_l2_ops` ivfflat index was paired
-- with the `<#>` (inner-product) operator and therefore never served the
-- ORDER BY.
--
-- Build on the empty/small column first, then backfill — cheap incremental
-- build. (On an already-large table, build CONCURRENTLY in a dedicated
-- non-transactional migration instead.)
---------------------------------------------------------------------
CREATE INDEX object_embedding_gemini_image_hnsw_idx
  ON grida_library.object_embedding
  USING hnsw (gemini_embedding_2__image vector_cosine_ops);

-- PARTIAL index — honors the optional text vector (described objects only).
CREATE INDEX object_embedding_gemini_text_hnsw_idx
  ON grida_library.object_embedding
  USING hnsw (gemini_embedding_2__text vector_cosine_ops)
  WHERE gemini_embedding_2__text IS NOT NULL;

---------------------------------------------------------------------
-- [search rpc — semantic text search] --
--
-- Query is a pre-computed 1536-dim text embedding (the caller embeds the
-- search string with the SAME model/dims/normalization as the worker).
--
-- Two tiers, ordered, NEVER score-blended:
--   tier 1  described objects, text<->text (authoritative same-modality)
--   tier 2  undescribed objects only, cross-modal text-query<->image (floor)
-- The integer `tier` dominates the sort; the two cosine distances are NOT
-- comparable to each other and are only used to order WITHIN a tier.
--
-- Returns `setof grida_library.object` exactly: the tier/dist columns are
-- computed in a sub-select used only for ranking, then we join back to the
-- object table to project just the object columns.
--
-- Read-only over a public_read table → no SECURITY DEFINER.
---------------------------------------------------------------------
create or replace function grida_library.search(
  query_embedding vector(1536),
  match_count int default 60,
  match_offset int default 0,
  match_category text default null
)
returns setof grida_library.object
language sql
stable
as $$
  with ranked as (
    -- tier 1: described objects, same-modality text<->text
    select
      e.object_id,
      1 as tier,
      (e.gemini_embedding_2__text <=> query_embedding) as dist
    from grida_library.object_embedding e
    join grida_library.object o on o.id = e.object_id
    where e.gemini_embedding_2__text is not null
      and (match_category is null or o.category = match_category)

    union all

    -- tier 2: undescribed objects only, cross-modal floor (text query <-> image)
    select
      e.object_id,
      2 as tier,
      (e.gemini_embedding_2__image <=> query_embedding) as dist
    from grida_library.object_embedding e
    join grida_library.object o on o.id = e.object_id
    where e.gemini_embedding_2__text is null
      and e.gemini_embedding_2__image is not null
      and (match_category is null or o.category = match_category)

    order by tier asc, dist asc
    limit match_count offset match_offset
  )
  select o.*
  from grida_library.object o
  join ranked on ranked.object_id = o.id
  order by ranked.tier asc, ranked.dist asc, o.id asc;  -- o.id = stable paging tiebreaker
$$;
