-- Catalog UUIDs survive object-storage changes. Existing IDs, paths, hashes,
-- metadata, embeddings and collection references are deliberately untouched.
-- Hash backfill is a separate, reviewed operation over the stored bytes.
ALTER TABLE grida_library.object
  DROP CONSTRAINT object_id_fkey,
  ALTER COLUMN id SET DEFAULT gen_random_uuid();

-- Several historical catalog records can describe the same exact bytes.
-- Storage paths remain unique; content hashes are lookup keys, not catalog IDs.
DROP INDEX grida_library.object_sha256_key;
CREATE INDEX object_sha256_idx
  ON grida_library.object (sha256)
  WHERE sha256 IS NOT NULL;

-- Keep object_require_sha256 and object_sha256_format_chk: new records still
-- require a valid hash, while unbackfilled legacy rows remain editable.
