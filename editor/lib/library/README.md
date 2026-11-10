# Library storage

The catalog and embeddings stay in Supabase. `LibraryStorage` projects byte URLs; `LibraryTigris` stores immutable SHA-256 objects; `LibraryUpload` retains the existing generated-image registration flow. Catalog UUIDs remain independent of byte identity.

| Environment variable                         | Purpose                                                                                                              |
| -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_GRIDA_LIBRARY_STORAGE_PROVIDER` | `supabase` (default) or explicit `tigris` cutover                                                                    |
| `NEXT_PUBLIC_GRIDA_LIBRARY_ASSET_ORIGIN`     | Tigris public origin; defaults to `https://library.grida.co`. An explicit loopback HTTP origin supports local tests. |
| `GRIDA_LIBRARY_TIGRIS_BUCKET`                | Required dedicated bucket when using Tigris                                                                          |
| `GRIDA_LIBRARY_TIGRIS_ACCESS_KEY_ID`         | Server-only scoped object credential                                                                                 |
| `GRIDA_LIBRARY_TIGRIS_SECRET_ACCESS_KEY`     | Server-only secret; never use a public-prefixed variable                                                             |
| `GRIDA_LIBRARY_TIGRIS_ENDPOINT`              | S3 endpoint; defaults to `https://t3.storage.dev`. Loopback HTTP supports local protocol tests.                      |

Keep the provider unset while preparing the migration. Before enabling it, copy and verify the source bytes, apply the reviewed Storage-FK/index migration, then backfill every catalog SHA and update external producers/worker. Public configuration is embedded in the web build; deploy matching server/browser configuration together. Tigris mode fails on missing hashes or credentials rather than falling back to another provider.

New objects use the full-file digest plus pinned image extension. PUT uses a create-only condition and checksum; HEAD must return matching size/type and a `FULL_OBJECT` SHA-256. Every upload or existing-key adoption also streams the stored object back and independently verifies its exact length and SHA-256 before catalog registration. Tigris can return a supplied checksum in HEAD even when the stored bytes differ, so checksum metadata alone is insufficient. Existing catalog duplicates keep their UUIDs; repeated generated-image uploads adopt the earliest `(created_at, id)` record without editing its metadata. New hash-path conflicts adopt the winning insertion. Registration failure leaves recoverable bytes for a same-byte retry.

With [Global bucket placement](https://www.tigrisdata.com/docs/buckets/locations/), confirmation applies to the serving region; replication to other regions can lag. Conditional object creation does not provide a global catalog lock. Producers derive identical bytes and MIME metadata for a content address, and the database's unique path arbitrates new catalog insertions. Retry an unconfirmed upload with the same bytes.

The public Library UI downloads Tigris bytes with CORS and saves a browser Blob directly. Tigris does not honor signed response-disposition overrides on the qualified public bucket, so the download field remains the public byte URL; HTTP-only consumers choose their own output filename. This introduces no app-server byte relay or Desktop connection permission. Saved Supabase URLs and the existing numbered asset presets remain served by their original source; retain old objects until those references can be retired. This change does not add an ingestion API or move the enrichment worker.

Run focused tests from `editor` with `pnpm exec vitest run lib/library app/\(library\)/library`. The S3 transport fixture binds only loopback and uses synthetic bytes; it does not contact cloud storage or inference services. Keep ordinary local corpus development on local Supabase.
