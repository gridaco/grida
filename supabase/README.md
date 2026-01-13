# Supabase / Database (contributors)

This folder contains our Supabase project configuration and database migrations.

- **Migrations**: `./migrations/*` (source of truth for schema changes)
- **Declarative schemas (reference only)**: `./schemas/*` (not guaranteed fully synced; see `schemas/README.md`)

---

## Local development (safe by default)

Local development uses **Supabase CLI + Docker** and runs a fully local stack (Postgres, Auth, Storage, Studio, etc.) on `127.0.0.1`.

```txt

╭──────────────────────────────────────╮
│ 🔧 Development Tools                 │
├─────────┬────────────────────────────┤
│ Studio  │ http://127.0.0.1:54323     │
│ Mailpit │ http://127.0.0.1:54324     │
│ MCP     │ http://127.0.0.1:54321/mcp │
╰─────────┴────────────────────────────╯

╭──────────────────────────────────────────────────────╮
│ 🌐 APIs                                              │
├────────────────┬─────────────────────────────────────┤
│ Project URL    │ http://127.0.0.1:54321              │
│ REST           │ http://127.0.0.1:54321/rest/v1      │
│ GraphQL        │ http://127.0.0.1:54321/graphql/v1   │
│ Edge Functions │ http://127.0.0.1:54321/functions/v1 │
╰────────────────┴─────────────────────────────────────╯

╭───────────────────────────────────────────────────────────────╮
│ ⛁ Database                                                    │
├─────┬─────────────────────────────────────────────────────────┤
│ URL │ postgresql://postgres:postgres@127.0.0.1:54322/postgres │
╰─────┴─────────────────────────────────────────────────────────╯

```

**Key safety property**

- Running local commands **does not require** a Supabase access token and **does not know about any remote project** unless you explicitly link one.
- If you never run `supabase link`, you can safely “abuse” local commands like reset/seed/drop without any chance of touching production.

### Setup

- Install prerequisites:
  - Docker Desktop (running)
  - Supabase CLI (`supabase`)
- From the repo root, work inside `./supabase` (commands below assume `cd supabase`).

### JWT signing keys (one-time local setup)

This repo intentionally does **not** commit `signing_keys.json` (it’s gitignored). You may need to generate it once for local setup.

```bash
cd supabase
# NOTE: local Auth currently expects a single signing key.
# This command prints a private JWK to stdout — write it to `signing_keys.json`.
supabase gen signing-key --algorithm ES256 > signing_keys.json
```

### JWT Signing Keys - Infra (required by `grida_ciam`)

When using the **`grida_ciam` customer CIAM** flow (email OTP → customer session → JWT → RLS), the backend needs to **mint JWTs that PostgREST can verify**.

On **hosted Supabase**, the platform-managed signing keys are **not extractable** (you cannot download the private key). This is intentional for security. As a result, `grida_ciam` **cannot** rely on the Supabase-infra-provided private key to mint JWTs.

Instead, you must **bring your own signing key** (ES256 recommended) and **import it into your Supabase project**, so:

- Your backend (self-hosted Grida) can **sign** JWTs using the private key.
- Supabase / PostgREST can **verify** those JWTs using the corresponding public key (via JWKS).

This does **not** meaningfully disadvantage you. It is the standard approach for “custom / third-party JWTs”.

#### Setup (hosted Supabase)

1. Generate your own private key (use CLI or any secure tooling):

```bash
supabase gen signing-key --algorithm ES256
```

Important:

- **Do not** commit production keys.
- Store the production private key in a secure secret manager (or generate it in a secure environment and never persist it outside your secret store).

2. In Supabase dashboard (hosted production), go to JWT signing keys:

- `https://supabase.com/dashboard/project/_/settings/jwt`
- Create a new **Standby Key**
- Choose **Import an existing private key**
- Paste the private JWK JSON and save (UI labels may change)
- Click **Rotate** (optional: revoke older keys later if you want to keep only one trusted key)

This makes Supabase trust JWTs signed by your imported key (via the project’s `.../auth/v1/.well-known/jwks.json`).

3. Configure your Grida backend environment with the private key:

- Set `SUPABASE_SIGNING_KEY_JSON='{...}'` to the **private JWK JSON** (must include `d`).

`grida_ciam` uses this to sign customer session JWTs for the customer portal flow (we chose this to avoid coupling / polluting `auth.users` while enabling strict per-tenant dedup).

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

### Database tests (pgTAP)

We keep database tests under `./tests/*.sql`.

Create a new test file:

```bash
supabase test new <name>
```

Run tests against your local database:

```bash
supabase db test
```

### Supabase Types

[`database/database-generated.types.ts`](../database/database-generated.types.ts) is generated by running the following command:

```bash
# cwd //

supabase gen types typescript --local \
  --schema public \
  --schema grida_ciam \
  --schema grida_ciam_public \
  --schema grida_library \
  --schema grida_www \
  --schema grida_g11n \
  --schema grida_x_supabase \
  --schema grida_sites \
  --schema grida_canvas \
  --schema grida_commerce \
  --schema grida_forms_secure \
  --schema grida_forms \
  --schema grida_storage \
  --schema grida_west \
  --schema grida_west_referral \
  > database/database-generated.types.ts

# or with --project-id for hosted db
supabase gen types typescript \
  --project-id $PROJECT_REF \
  ...
```

### Good local workflow

- Make schema changes by writing SQL migrations in `./migrations/`.
- Use `supabase db reset` frequently to ensure a clean, reproducible state.
- Prefer type generation from `--local` while iterating.

### Environment Variables

The editor requires the following Supabase environment variables (set in `editor/.env.local`):

**Required:**

- `NEXT_PUBLIC_SUPABASE_URL` - Your Supabase project URL

**Public key:**

- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` - The publishable key

**Secret key (new preferred):**

- `SUPABASE_SECRET_KEY` - The secret key for server-side operations (replaces service role key)

After running `supabase start`, you can find these values in the output or by running `supabase status`.

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
