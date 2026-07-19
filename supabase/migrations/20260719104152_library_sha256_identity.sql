-- #929 — content-addressed library, increment 1: sha256 identity lands.
-- Spec: docs/wg/platform/library.md §3 "Identity and ingestion".
--
-- Adds the content address column to grida_library.object:
--   - sha256 of the stored bytes, lowercase hex (64). Nullable = legacy regime
--     (pre-backfill) only; new rows MUST carry it (INSERT guard below).
--   - Partial unique index gives synchronous dedup for hashed rows while the
--     legacy corpus is still NULL.
--   - The guard is a BEFORE INSERT trigger, NOT a `CHECK ... NOT VALID`:
--     a NOT VALID check would still fire on UPDATEs of legacy rows, breaking
--     the worker's derived-metadata writes and curation edits. INSERT-only
--     enforcement = "NOT NULL for new rows" with legacy rows editable.
--     Replaced by a real SET NOT NULL after the corpus backfill.

ALTER TABLE grida_library.object
  ADD COLUMN sha256 TEXT
  CONSTRAINT object_sha256_format_chk CHECK (sha256 ~ '^[0-9a-f]{64}$');

COMMENT ON COLUMN grida_library.object.sha256 IS
  'Content address: SHA-256 of the currently stored bytes, lowercase hex. NULL = legacy (pre-backfill) regime. See docs/wg/platform/library.md §3.';

CREATE UNIQUE INDEX object_sha256_key
  ON grida_library.object (sha256)
  WHERE sha256 IS NOT NULL;

CREATE FUNCTION grida_library.fn_object_require_sha256()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NEW.sha256 IS NULL THEN
    RAISE EXCEPTION 'grida_library.object: sha256 is required for new objects (content addressing, #929)'
      USING ERRCODE = '23502';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER object_require_sha256
  BEFORE INSERT ON grida_library.object
  FOR EACH ROW
  EXECUTE FUNCTION grida_library.fn_object_require_sha256();
