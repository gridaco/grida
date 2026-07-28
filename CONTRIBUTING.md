# Contributing to Grida

---

## Prerequisites

Grida uses **Git LFS** for binary test fixtures (`*.fig` / `*.deck` under `fixtures/`). Install it **before cloning** — otherwise these files come down as text pointer stubs and Figma-import tests break.

```bash
# install git-lfs and register its git filters (once per machine)
brew install git-lfs
git lfs install
```

First, clone the repo.

```bash
# clone the repo (LFS files are fetched automatically once git-lfs is installed)
git clone https://github.com/gridaco/grida
cd grida

# or, if you cloned before installing git-lfs
git lfs pull

# setup node & package manager
nvm use
corepack enable pnpm

# install just (command runner)
brew install just

# install typos (typo checker) — note: the formula is `typos-cli`, not `typos`
brew install typos-cli
```

Then, install the dependencies and run the development server:

```bash
# (1) install dependencies
pnpm install

# run all (not recommended)
pnpm turbo dev

# run specific app
pnpm dev:editor

# or simply..
cd editor
pnpm dev # (cwd:/editor)

# -----
# building
pnpm turbo build
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

> **Running `pnpm typecheck` from a clean checkout?** It depends on compiled package artifacts, so build the shared packages first:
>
> ```bash
> pnpm build:packages
> pnpm typecheck
> ```
>
> See [`AGENTS.md`](./AGENTS.md) ("Running `pnpm typecheck` from a clean checkout") for the full sequence.

## Authenticated local development

For feature development and UI verification that needs a signed-in user, use
the local Supabase stack with insiders auth. Use the hosted/default sign-in
path only when authentication itself is the feature under development or test.

Insiders auth is not a separate authentication backend. It selects the
local-only email/password sign-in page while continuing to use the Supabase
project configured in `editor/.env.local`. Both the local Supabase connection
and the insiders-auth flag must therefore be configured.

Install and run:

- [Docker Desktop](https://docker.com)
- Supabase CLI (`brew install supabase/tap/supabase`)

```bash
cd supabase
supabase start
supabase db reset --local
supabase status -o env
```

Configure `editor/.env.local` with the local values reported by
`supabase status -o env`:

```bash
# API_URL
SUPABASE_URL="http://127.0.0.1:54321"
NEXT_PUBLIC_SUPABASE_URL="http://127.0.0.1:54321"

# PUBLISHABLE_KEY and SECRET_KEY
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY="<PUBLISHABLE_KEY>"
SUPABASE_SECRET_KEY="<SECRET_KEY>"

# Use the local email/password sign-in path.
NEXT_PUBLIC_GRIDA_USE_INSIDERS_AUTH="1"
```

Restart the editor dev server after changing these variables. Sign in with
**`insider@grida.co` / `password`**; this seeded user owns the `local`
organization and is the default persona for normal feature work.

[`supabase/README.md`](./supabase/README.md) is the local-backend runbook.
[`supabase/seed.md`](./supabase/seed.md) documents the other seeded personas
for multi-tenant and no-organization testing.

## The Rust engine

The Rust rendering engine (canvas WASM) is developed in
[gridaco/nothing](https://github.com/gridaco/nothing). This repo does not
contain Rust code and needs no Rust toolchain — the editor consumes the
published `@grida/canvas-wasm` package from npm. To contribute to the engine
itself, see that repository.

### Where work gets filed

- **[gridaco/nothing](https://github.com/gridaco/nothing)**: engine rendering,
  the node/document model, `.grida` format/schema, engine text/SVG/HTML import,
  reftests and engine perf, `@grida/canvas-wasm` publishing, engine WG specs.
- **This repo**: the editor/product, desktop, forms/database, the SVG editor
  (TS), platform/billing, and everything user-facing.
- When unsure: file where the fix would land. Cross-repo references are always
  full `gridaco/<repo>#N` form — never bare `#N`.

## Support

If you have any problem running the project locally or for any further information, please contact us via Slack.

- [joining our slack channel](https://grida.co/join-slack)

**See Also**

- [AGENTS.md](./AGENTS.md) has a comprehensive list of the project structure and the purpose of each directory and file.
