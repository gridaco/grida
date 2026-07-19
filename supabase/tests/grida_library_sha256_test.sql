BEGIN;
SELECT plan(13);

-- ===================================================================
-- grida_library content addressing (#929, increment 1)
--
-- Pins the sha256 identity contract on grida_library.object:
--   - column shape + lowercase-hex CHECK
--   - partial unique index (dedup over hashed rows; legacy NULLs coexist)
--   - INSERT-only guard trigger: new rows MUST carry sha256, while legacy
--     (NULL-sha256) rows remain UPDATE-able — the regression this file
--     exists to pin (a CHECK ... NOT VALID would break legacy updates).
-- Spec: docs/wg/platform/library.md §3.
-- ===================================================================

-- ── shape ──────────────────────────────────────────────────────────
SELECT has_column('grida_library', 'object', 'sha256', 'object.sha256 exists');
SELECT col_type_is('grida_library', 'object', 'sha256', 'text', 'sha256 is text');
SELECT ok(
  pg_get_indexdef('grida_library.object_sha256_key'::regclass)
    ~* 'create unique index .*\(sha256\).* where \(sha256 is not null\)',
  'object_sha256_key is a partial unique index over non-NULL sha256'
);
SELECT has_trigger('grida_library', 'object', 'object_require_sha256', 'INSERT guard trigger exists');
SELECT has_function('grida_library', 'fn_object_require_sha256', '{}'::name[], 'guard function exists');

-- ── fixtures (self-contained; rolled back) ─────────────────────────
INSERT INTO grida_library.category (id, name) VALUES ('testsha', 'Test');

-- Self-contained bucket: the (newer) storage.prefixes trigger FK-references
-- storage.buckets, so the bucket must exist. Don't depend on seed data.
INSERT INTO storage.buckets (id, name) VALUES ('testshabucket', 'testshabucket')
  ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.objects (id, bucket_id, name) VALUES
  ('dddddddd-dddd-dddd-dddd-dddddddddd01', 'testshabucket', 'o1.png'),
  ('dddddddd-dddd-dddd-dddd-dddddddddd02', 'testshabucket', 'o2.png'),
  ('dddddddd-dddd-dddd-dddd-dddddddddd03', 'testshabucket', 'o3.png');

-- ── guard: new rows must carry sha256 ──────────────────────────────
SELECT throws_ok(
  $$ INSERT INTO grida_library.object (id, path, category, mimetype, width, height, bytes, transparency)
     VALUES ('dddddddd-dddd-dddd-dddd-dddddddddd01', 'o1.png', 'testsha', 'image/png', 1, 1, 1, false) $$,
  '23502', NULL,
  'INSERT without sha256 is rejected by the guard'
);

-- ── CHECK: lowercase hex, 64 chars ─────────────────────────────────
SELECT throws_ok(
  $$ INSERT INTO grida_library.object (id, path, category, mimetype, width, height, bytes, transparency, sha256)
     VALUES ('dddddddd-dddd-dddd-dddd-dddddddddd01', 'o1.png', 'testsha', 'image/png', 1, 1, 1, false, 'not-a-hash') $$,
  '23514', NULL,
  'non-hex sha256 violates the format CHECK'
);
SELECT throws_ok(
  format(
    $$ INSERT INTO grida_library.object (id, path, category, mimetype, width, height, bytes, transparency, sha256)
       VALUES ('dddddddd-dddd-dddd-dddd-dddddddddd01', 'o1.png', 'testsha', 'image/png', 1, 1, 1, false, %L) $$,
    repeat('A1', 32)
  ),
  '23514', NULL,
  'UPPERCASE hex violates the format CHECK (lowercase is canonical)'
);

-- ── happy path + dedup ─────────────────────────────────────────────
SELECT lives_ok(
  format(
    $$ INSERT INTO grida_library.object (id, path, category, mimetype, width, height, bytes, transparency, sha256)
       VALUES ('dddddddd-dddd-dddd-dddd-dddddddddd01', 'o1.png', 'testsha', 'image/png', 1, 1, 1, false, %L) $$,
    repeat('d4', 32)
  ),
  'hashed INSERT succeeds'
);
SELECT throws_ok(
  format(
    $$ INSERT INTO grida_library.object (id, path, category, mimetype, width, height, bytes, transparency, sha256)
       VALUES ('dddddddd-dddd-dddd-dddd-dddddddddd02', 'o2.png', 'testsha', 'image/png', 1, 1, 1, false, %L) $$,
    repeat('d4', 32)
  ),
  '23505', NULL,
  'same sha256 twice → unique_violation (synchronous dedup)'
);

-- ── legacy regime: NULL-sha256 rows coexist and stay editable ──────
SELECT lives_ok(
  format(
    $$ INSERT INTO grida_library.object (id, path, category, mimetype, width, height, bytes, transparency, sha256)
       VALUES ('dddddddd-dddd-dddd-dddd-dddddddddd02', 'o2.png', 'testsha', 'image/png', 1, 1, 1, false, %L) $$,
    repeat('e5', 32)
  ),
  'second object with a distinct sha256 inserts'
);
SELECT lives_ok(
  $$ UPDATE grida_library.object SET sha256 = NULL
     WHERE id IN ('dddddddd-dddd-dddd-dddd-dddddddddd01', 'dddddddd-dddd-dddd-dddd-dddddddddd02') $$,
  'guard is INSERT-only: rows can be updated to NULL sha256 (legacy simulation), and two NULL rows coexist under the partial index'
);
SELECT lives_ok(
  $$ UPDATE grida_library.object SET title = 'legacy row, still editable', colors = '{#aabbcc}'
     WHERE id = 'dddddddd-dddd-dddd-dddd-dddddddddd01' $$,
  'legacy (NULL-sha256) rows remain UPDATE-able — worker metadata writes and curation are unaffected'
);

SELECT * FROM finish();
ROLLBACK;
