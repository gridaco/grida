# Prepare a Library object migration

This standard-library Python tool rehashes a verified local Library archive and
prepares deterministic CAS-copy, legacy-location and catalog-hash backfill files.
It performs no network requests, object-store writes or database execution.

```sh
python3 scripts/library-migration/prepare.py \
  --archive /path/to/verified-library-archive \
  --output /path/to/new-review-directory
python3 -m unittest discover -s scripts/library-migration -p 'test_*.py'
```

The input is a local-only archive prepared separately: `manifest.jsonl`, original
files under `objects/`, `catalog-inventory.json`, and the complete portable
`metadata/api-export/object.jsonl.gz`. When present, `storage-before.json` must
cover exactly the same original keys, Storage UUIDs and sizes. This tool does not
collect an archive or establish that production has remained frozen since it.

Every original file is streamed through SHA-256, length checked and matched to
its recorded image MIME. Unsafe paths, symlinks, unsupported types, conflicting
aliases and disagreement between the two catalog captures fail preparation.
The six-type MIME/extension map matches the product's Library storage contract.
Files are never re-encoded, moved or removed. Choose an output directory outside
the archive; an existing output directory is refused.

- `objects.jsonl`: one destination hash key per distinct payload, with an original
  relative source file and verified MIME/length.
- `legacy-locations.jsonl`: every original key, Storage identity/version/ETag and
  its destination. Storage-only files remain represented.
- `backfill.sql`: a standalone, reviewable psql script. It loads a temporary COPY
  mapping, locks the catalog, asserts exact UUID/path/size/MIME coverage and
  existing hashes, and updates **only** `object.sha256`. It requires the separate
  storage-independent forward migration first, rejects catalog UPDATE triggers,
  compares every other catalog field before/after, and commits only on success.
  An assertion error aborts the transaction; psql exits with ON_ERROR_STOP.
- `summary.json` and `SHA256SUMS`: source/destination counts and file checksums.

Review the output and separately qualify destination delivery before executing
any backfill. The tool does not authorize a database target, upload, provider
cutover or source deletion. A paused writer/enricher maintenance window remains
necessary for a real migration. Fixed embeddings and collection data are outside
the backfill's mutation surface; an isolated restore/rehearsal should verify them.

The SQL accepts a previously completed identical backfill. A newly added catalog
row, changed path/size/MIME or conflicting non-null hash requires a fresh reviewed
archive rather than relaxing assertions. Historical same-byte UUIDs remain
distinct; this operation neither selects nor merges catalog records.
