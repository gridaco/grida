BEGIN;
SELECT plan(12);

-- Storage replacement does not replace catalog identity or weaken public-read /
-- trusted-write access. Every fixture and enqueued job is rolled back below.
SET LOCAL ROLE service_role;
INSERT INTO grida_library.category (id, name) VALUES ('teststore', 'Storage test');
CREATE TEMP TABLE library_storage_new_object (id uuid);

SELECT lives_ok(
  $$ WITH inserted AS (
       INSERT INTO grida_library.object
         (path, category, mimetype, width, height, bytes, transparency, sha256)
       VALUES
         (repeat('a6', 32) || '.png', 'teststore', 'image/png', 1, 1, 1, false, repeat('a6', 32))
       RETURNING id
     ) INSERT INTO library_storage_new_object SELECT id FROM inserted $$,
  'catalog registration generates its own UUID without a Storage object'
);
SELECT ok(
  (SELECT id IS NOT NULL AND NOT EXISTS (
     SELECT 1 FROM storage.objects s WHERE s.id = n.id
   ) FROM library_storage_new_object n),
  'the generated catalog UUID is independent of storage.objects'
);
SELECT throws_ok(
  $$ INSERT INTO grida_library.object
       (path, category, mimetype, width, height, bytes, transparency, sha256)
     VALUES
       (repeat('a6', 32) || '.png', 'teststore', 'image/png', 1, 1, 1, false, repeat('a6', 32)) $$,
  '23505', NULL,
  'the same hash-derived path still rejects concurrent duplicate registrations'
);

INSERT INTO storage.buckets (id, name) VALUES ('teststorebucket', 'teststorebucket');
INSERT INTO storage.objects (id, bucket_id, name) VALUES
  ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeee01', 'teststorebucket', 'legacy/source.png');
INSERT INTO grida_library.object
  (id, path, title, category, mimetype, width, height, bytes, transparency, sha256)
VALUES
  ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeee01', 'legacy/source.png', 'Preserve metadata',
   'teststore', 'image/png', 1, 1, 1, false, repeat('c7', 32));
INSERT INTO grida_library.object_embedding
  (object_id, gemini_embedding_2__image, gemini_embedding_2__text)
VALUES
  ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeee01',
   ('[1' || repeat(',0', 1535) || ']')::vector,
   ('[0,1' || repeat(',0', 1534) || ']')::vector);
INSERT INTO grida_library.collection (id, slug, name, cover_object_id) VALUES
  ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeee02', 'teststore', 'Storage test',
   'eeeeeeee-eeee-eeee-eeee-eeeeeeeeee01');
INSERT INTO grida_library.collection_object (object_id, collection_id) VALUES
  ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeee01', 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeee02');
CREATE TEMP TABLE library_storage_before AS
SELECT md5(to_jsonb(o)::text) AS object_hash, md5(to_jsonb(e)::text) AS embedding_hash
FROM grida_library.object o
JOIN grida_library.object_embedding e ON e.object_id = o.id
WHERE o.id = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeee01';

SELECT lives_ok(
  $$ DELETE FROM storage.objects WHERE id = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeee01' $$,
  'retiring a source Storage record succeeds'
);
SELECT is(
  (SELECT count(*) FROM storage.objects WHERE id = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeee01'),
  0::bigint,
  'the source Storage record was actually deleted'
);
SELECT is(
  (SELECT md5(to_jsonb(o)::text) FROM grida_library.object o
   WHERE id = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeee01'),
  (SELECT object_hash FROM library_storage_before),
  'source deletion preserves the catalog UUID, path, metadata and timestamps'
);
SELECT is(
  (SELECT md5(to_jsonb(e)::text) FROM grida_library.object_embedding e
   WHERE object_id = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeee01'),
  (SELECT embedding_hash FROM library_storage_before),
  'source deletion preserves both embedding vectors and their row'
);
SELECT is(
  (SELECT cover_object_id FROM grida_library.collection
   WHERE id = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeee02'),
  'eeeeeeee-eeee-eeee-eeee-eeeeeeeeee01'::uuid,
  'source deletion preserves the collection cover'
);
SELECT is(
  (SELECT count(*) FROM grida_library.collection_object
   WHERE object_id = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeee01'
     AND collection_id = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeee02'),
  1::bigint,
  'source deletion preserves collection membership'
);

SET LOCAL ROLE anon;
SELECT is(
  (SELECT count(*) FROM grida_library.object
   WHERE id = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeee01'),
  1::bigint,
  'anonymous visitors can still read public Library assets'
);
SELECT throws_ok(
  $$ INSERT INTO grida_library.object
       (path, category, mimetype, width, height, bytes, transparency, sha256)
     VALUES ('anonymous.png', 'teststore', 'image/png', 1, 1, 1, false, repeat('d8', 32)) $$,
  '42501', NULL,
  'anonymous visitors still cannot create catalog records'
);
SET LOCAL ROLE authenticated;
SELECT is_empty(
  $$ UPDATE grida_library.object SET title = 'Untrusted edit'
     WHERE id = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeee01' RETURNING id $$,
  'ordinary authenticated users still cannot edit the public catalog'
);

SELECT * FROM finish();
ROLLBACK;
