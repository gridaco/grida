BEGIN;
SELECT plan(5);

-- ===================================================================
-- grida_library Gemini embedding RPCs: search() + similar()
--
-- Pins the two load-bearing invariants of the new retrieval design:
--   1. tier dominance — described (text<->text) results always outrank
--      the cross-modal image floor, even when the floor's distance is
--      smaller. The two cosine distances are NEVER blended.
--   2. cosine opclass/operator match — similar() ranks by `<=>` over the
--      cosine HNSW index (guards against a regression to the legacy
--      `<#>`/vector_l2_ops mismatch).
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

-- ── fixtures (self-contained; rolled back) ─────────────────────────
-- Three assets A, B, C backed by storage objects + a throwaway category.
INSERT INTO grida_library.category (id, name) VALUES ('testgem', 'Test');

INSERT INTO storage.objects (id, bucket_id, name) VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'library', 'testgem/a.png'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'library', 'testgem/b.png'),
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'library', 'testgem/c.png');

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

-- ── 3. similar() image cosine ordering ─────────────────────────────
-- similar(A): rank others by image distance to A.image (e1). B.image is
-- near e1, C.image is identical → C should actually be closest. Assert the
-- closer image ranks first and A itself is excluded.
SELECT results_eq(
  $$ SELECT id::text FROM grida_library.similar('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa') $$,
  $$ VALUES ('cccccccc-cccc-cccc-cccc-cccccccccccc'::text),
            ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::text) $$,
  'similar(A): image cosine order (C identical, then B near); A excluded'
);

SELECT * FROM finish();
ROLLBACK;
