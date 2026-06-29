BEGIN;
SELECT plan(6);

-- ===================================================================
-- grida_library Gemini embedding RPC: search()
--
-- Pins the load-bearing invariant of the new semantic search:
--   tier dominance — described (text<->text) results always outrank the
--   cross-modal image floor, even when the floor's distance is smaller.
--   The two cosine distances are NEVER blended.
--
-- (similar() is repointed to the gemini image vector by a separate cutover
-- migration applied after backfill; its test ships with that migration.)
-- ===================================================================

-- ── function existence ────────────────────────────────────────────
SELECT has_function(
  'grida_library', 'search',
  ARRAY['vector', 'integer', 'integer', 'text'],
  'grida_library.search(vector, int, int, text) exists'
);
SELECT has_function(
  'grida_library', 'similar',
  ARRAY['uuid'],
  'grida_library.similar(uuid) exists'
);

-- ── index contract: gemini vector indexes are HNSW + cosine ────────
-- Guards against a regression to the legacy ivfflat/vector_l2_ops shape.
SELECT ok(
  pg_get_indexdef(
    'grida_library.object_embedding_gemini_image_hnsw_idx'::regclass
  ) ~* 'using hnsw .*vector_cosine_ops',
  'gemini image index is HNSW cosine'
);
SELECT ok(
  pg_get_indexdef(
    'grida_library.object_embedding_gemini_text_hnsw_idx'::regclass
  ) ~* 'using hnsw .*vector_cosine_ops.*where .*gemini_embedding_2__text is not null',
  'gemini text index is HNSW cosine + NULL-filtered partial'
);

-- ── fixtures (self-contained; rolled back) ─────────────────────────
-- Three assets A, B, C backed by storage objects + a throwaway category.
INSERT INTO grida_library.category (id, name) VALUES ('testgem', 'Test');

-- Self-contained bucket: the (newer) storage.prefixes trigger FK-references
-- storage.buckets, so the bucket must exist. Don't depend on seed data.
INSERT INTO storage.buckets (id, name) VALUES ('testgembucket', 'testgembucket')
  ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.objects (id, bucket_id, name) VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'testgembucket', 'testgem/a.png'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'testgembucket', 'testgem/b.png'),
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'testgembucket', 'testgem/c.png');

INSERT INTO grida_library.object
  (id, path, category, mimetype, width, height, bytes, transparency) VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'testgem/a.png', 'testgem', 'image/png', 1, 1, 1, false),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'testgem/b.png', 'testgem', 'image/png', 1, 1, 1, false),
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'testgem/c.png', 'testgem', 'image/png', 1, 1, 1, false);

-- Synthetic 1536-d unit vectors:
--   e1     = [1,0,0,...]
--   e2     = [0,1,0,...]   (orthogonal to e1 → cosine distance 1)
--   eclose = [1,0.2,0,...] (small angle from e1)
--
-- A: text e1, image e1            → described, text matches a query=e1 exactly
-- B: text e2, image eclose        → described, text far from e1; image near e1
-- C: text NULL, image e1          → UNDESCRIBED; image identical to query=e1
INSERT INTO grida_library.object_embedding
  (object_id, gemini_embedding_2__image, gemini_embedding_2__text) VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
   ('[1'      || repeat(',0', 1535) || ']')::vector,
   ('[1'      || repeat(',0', 1535) || ']')::vector),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
   ('[1,0.2'  || repeat(',0', 1534) || ']')::vector,
   ('[0,1'    || repeat(',0', 1534) || ']')::vector),
  ('cccccccc-cccc-cccc-cccc-cccccccccccc',
   ('[1'      || repeat(',0', 1535) || ']')::vector,
   NULL);

-- ── 1. tier dominance ──────────────────────────────────────────────
-- query = e1. C's IMAGE is identical to the query (distance 0), but C is
-- undescribed → tier 2, so it must rank LAST, behind described A and B.
SELECT results_eq(
  format(
    $$ SELECT id::text FROM grida_library.search(%L::vector) $$,
    '[1' || repeat(',0', 1535) || ']'
  ),
  $$ VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::text),
            ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::text),
            ('cccccccc-cccc-cccc-cccc-cccccccccccc'::text) $$,
  'search(e1): tier-1 A then B; undescribed C last despite identical image'
);

-- ── 2. category filter ─────────────────────────────────────────────
-- A non-matching category returns nothing (all fixtures are testgem).
SELECT is_empty(
  format(
    $$ SELECT id FROM grida_library.search(%L::vector, 60, 0, 'nonexistent') $$,
    '[1' || repeat(',0', 1535) || ']'
  ),
  'search(): match_category filters out non-matching assets'
);

SELECT * FROM finish();
ROLLBACK;
