# Supabase / Database (contributors)

This folder contains our Supabase project configuration and database migrations.

- **Migrations**: `./migrations/*` (source of truth for schema changes)
- **Declarative schemas (reference only)**: `./schemas/*` (not guaranteed fully synced; see `schemas/README.md`)

---

## Local development (safe by default)

Local development uses **Supabase CLI + Docker** and runs a fully local stack (Postgres, Auth, Storage, Studio, etc.) on `127.0.0.1`.

| Service      | URL                                                       |
| ------------ | --------------------------------------------------------- |
| Studio       | `http://127.0.0.1:54323`                                  |
| API          | `http://127.0.0.1:54321`                                  |
| GraphQL      | `http://127.0.0.1:54321/graphql/v1`                       |
| Storage (S3) | `http://127.0.0.1:54321/storage/v1/s3`                    |
| DB           | `postgresql://postgres:postgres@127.0.0.1:54322/postgres` |

**Key safety property**

- Running local commands **does not require** a Supabase access token and **does not know about any remote project** unless you explicitly link one.
- If you never run `supabase link`, you can safely “abuse” local commands like reset/seed/drop without any chance of touching production.

### Setup

- Install prerequisites:
  - Docker Desktop (running)
  - Supabase CLI (`supabase`)
- From the repo root, work inside `./supabase` (commands below assume `cd supabase`).

### Day-to-day commands (local only)

Start / stop / inspect local stack:

```bash
supabase start
supabase status
supabase stop
```

Reset local database (drop + re-apply migrations + seed):

```bash
supabase db reset
```

Create a new migration:

```bash
supabase migration new <name>
```

Apply migrations locally (when you don’t want a full reset):

```bash
supabase migration up
```

Generate types from **local** DB (examples):

```bash
# Print to stdout
supabase gen types typescript --local

# (Optional) update the repo’s generated types file
supabase gen types typescript --local > ../database/database-generated.types.ts
```

### Good local workflow

- Make schema changes by writing SQL migrations in `./migrations/`.
- Use `supabase db reset` frequently to ensure a clean, reproducible state.
- Prefer type generation from `--local` while iterating.

---

## Production (caution)

Everything in this section can affect **remote** environments. Keep this minimal and refer to official docs for details.

**Rules**

- Never run remote commands while “testing something quickly”.
- Never run destructive commands (anything that resets/drops) against remote databases.
- Treat `supabase link` as the point where commands can start targeting a remote project.

### Link the CLI to a remote project (enables remote operations)

```bash
supabase link --project-ref <project-ref>
```

Notes:

- Linking writes local project metadata (and may create/update `.supabase/`), so be mindful of what you commit.
- Remote commands typically require `SUPABASE_ACCESS_TOKEN` (do not commit tokens; use your shell env).

### Deploy migrations to the linked remote database

```bash
supabase db push
```

### Generate types from the linked remote project

```bash
supabase gen types typescript --linked
```

### Official docs

- Local development: `https://supabase.com/docs/guides/local-development`
- CLI reference: `https://supabase.com/docs/reference/cli/introduction`

If you’re unsure, **do not run production commands**—stick to the local workflow above.
