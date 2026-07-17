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

## The Rust engine

The Rust rendering engine (canvas WASM) is developed in
[gridaco/nothing](https://github.com/gridaco/nothing). This repo does not
contain Rust code and needs no Rust toolchain — the editor consumes the
published `@grida/canvas-wasm` package from npm. To contribute to the engine
itself, see that repository.

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

## Running backend (supabase) locally

- follow this [guide](https://supabase.io/docs/guides/local-development) to run supabase locally
  - supabase cli required (`brew install supabase/tap/supabase`)
  - [docker desktop](https://docker.com) required
- for Grida-specific Supabase setup (migrations, env, signing keys), see `supabase/README.md`.

### Signing in locally

After `supabase db reset --local` runs, `supabase/seed.sql` creates three test users you can sign in as via the `/sign-in` route. The default for normal flows is **`insider@grida.co` / `password`** (owner of the `local` org). See [`supabase/seed.md`](./supabase/seed.md) for the other personas (`alice@acme.com` for multi-tenant testing, `random@example.com` for no-org access checks). All three share the password `password`.

## Support

If you have any problem running the project locally or for any further information, please contact us via Slack.

- [joining our slack channel](https://grida.co/join-slack)

**See Also**

- [AGENTS.md](./AGENTS.md) has a comprehensive list of the project structure and the purpose of each directory and file.
