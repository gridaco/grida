---
name: opt-library
description: >
  Set up, download, verify, and seed the optional Grida Library developer
  corpus into local Supabase. Use when Library browse/search, Desktop
  reference picking, or agent Library tools need realistic local assets and
  Gemini embeddings; also use when changing the gridaco/grida consumer for
  gridaco/library developer-corpus releases.
---

# Optional Library

`opt-library` is the setup and seeding skill for Grida's optional local
Library service fixture. Use it to add a realistic corpus to an already-running
local Grida stack. Keep it separate from the canonical migrations and base
seed.

## Why it is optional

The standard local database is complete without Library content. Its base seed
creates only the categories required by ordinary development; an empty public
corpus is valid.

The developer corpus is an additional product-development fixture: the current
[Home prerelease](https://github.com/gridaco/library/releases/tag/developer-corpus-home-v1-rc.1)
contains 631 images and is about 137 MiB compressed. Making it part of
`supabase db reset` would impose download, storage, and reset costs on every
contributor, including those not working on Library discovery. A reset
therefore removes this optional data; rerun this skill when it is needed.

Seeding does not call an AI provider. The approved archive already contains the
matching image and text representations. Runtime semantic queries still need
Grida's configured query-embedding provider; cold browse works without it.

## Repository topology

The Library deliberately spans two repositories:

- [`gridaco/grida`](https://github.com/gridaco/grida) owns the data plane:
  Supabase schema and migration history, the public `library` storage bucket,
  product retrieval surfaces, and this local importer.
- [`gridaco/library`](https://github.com/gridaco/library) owns content
  operations: curation, batch producers, enrichment, and bounded developer
  corpus releases.

Do not move schema ownership or production credentials into the operations
repository. Do not turn this importer into a production connector. The handoff
between repositories is the versioned, sanitized archive contract.

Read the canonical [Grida Library working-group
document](https://grida.co/docs/wg/platform/library) before changing this
boundary. The operations-side archive contract is documented in
[`fixture_release/README.md`](https://github.com/gridaco/library/blob/main/fixture_release/README.md).
The product surfaces are the [Library](https://grida.co/library) and its
[licensing page](https://grida.co/library/license).

## Seed local Supabase

> **GRIDA-SEC-009 — local-destination boundary.** `seed` accepts only the
> exact `127.0.0.1` API and database ports declared by this checkout's
> `supabase/config.toml`. It rejects `localhost`, IPv6 and alternate loopback
> hosts, remote/lookalike hosts, wrong ports or URL shapes, and all
> caller-provided destination URLs and keys before downloading or writing.

Run from the `gridaco/grida` repository root:

```sh
supabase start
python .agents/skills/opt-library/scripts/seed.py seed
```

Use the normal local Supabase prerequisites plus Python 3.12 and `psql`.

The command:

1. downloads the pinned public prerelease into `.tmp/opt-library/`;
2. verifies its pinned SHA-256, manifest, inventory, assets, and embedding
   contract before writing;
3. obtains only the running local project's URL and service-role key from
   `supabase status`;
4. requires exact `127.0.0.1` API and database endpoints on the ports declared
   by this checkout's `supabase/config.toml`;
5. uploads content-addressed assets;
6. transactionally upserts catalog rows and embeddings while suppressing only
   the redundant enrichment-enqueue trigger;
7. verifies database relationships and re-hashes a public local Storage read.

It is idempotent by content hash. Use `--limit` for a quick smoke seed:

```sh
python .agents/skills/opt-library/scripts/seed.py seed --limit 12
```

Inspect or prefetch the release without touching the database:

```sh
python .agents/skills/opt-library/scripts/seed.py download
python .agents/skills/opt-library/scripts/seed.py verify
```

Pass `--archive /path/to/archive.zip` to verify or seed a maintainer-built
archive. Treat that as an explicit local override; the default release remains
pinned and must never silently follow `latest`.

## Safety and maintenance

- Keep this workflow opt-in. Never add the corpus to `supabase/seed.sql` or
  `supabase/config.toml` storage seeding.
- Before changing Library migrations, schemas, RLS, grants, or the canonical
  base seed, load the [database skill](../database/SKILL.md). Ordinary corpus
  download and local seeding remain in this skill.
- Never read a production Supabase environment or accept a destination URL/key
  on the command line. The importer must discover the local stack itself and
  reject anything except the exact configured `127.0.0.1` endpoints.
- Verify the complete archive before the first database or storage write.
- Preserve content-derived identity. Store new assets at
  `<sha256>.<extension>` and use the local Storage object ID as catalog identity.
- Preserve archive license values verbatim. Do not infer a broader license.
- Run `supabase db reset --local` before database-test suites that expect the
  canonical empty corpus. The reset intentionally removes this optional seed.
- When the archive format, representation model, or pinned release changes,
  update the validator and constants together, then verify both a smoke seed
  and the full corpus.
