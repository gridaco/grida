# Contributing to Grida

---

## Prerequisites

Grida uses **Git LFS** for binary fixtures and prebuilt artifacts (`*.fig` / `*.deck` test fixtures and the prebuilt canvas WASM in `crates/grida-canvas-wasm/lib/bin/*.wasm`). Install it **before cloning** — otherwise these files come down as text pointer stubs and you'll see `git-lfs: command not found` warnings on every build, plus broken fixtures/WASM.

```bash
# install git-lfs and register its git filters (once per machine)
brew install git-lfs
git lfs install
```

First, clone the repo with git submodules (required for canvas/WASM builds; GitHub Desktop clones submodules automatically).

```bash
# clone the repo (LFS files are fetched automatically once git-lfs is installed)
git clone --recurse-submodules https://github.com/gridaco/grida
cd grida

# or, if you already cloned without --recurse-submodules / before installing git-lfs
git submodule update --init
git lfs pull

# setup node & package manager
nvm use
corepack enable pnpm

# install just (command runner)
brew install just

# install typos (typo checker) — note: the formula is `typos-cli`, not `typos`
brew install typos-cli
```

## Rust / Canvas (Skia) prerequisites

> Only needed if you work on the Rust crates (`crates/**`) or build the canvas WASM. The Node/TypeScript workflow (`pnpm install`, `pnpm dev:editor`, `pnpm typecheck`, `pnpm test`) does **not** require Rust — the editor consumes the prebuilt WASM pulled via Git LFS.

### Rust toolchain

Install Rust via [rustup](https://rustup.rs). The repo pins the exact toolchain in `rust-toolchain.toml` (currently `1.92.0` with `rustfmt` + `clippy`), so rustup auto-installs and selects the right version the first time you run a `cargo` command inside the repo — no manual version pick needed.

```bash
# install rustup (official installer — avoids Homebrew's keg-only PATH caveats)
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# verify (run inside the repo so rust-toolchain.toml is honored)
cargo --version   # -> cargo 1.92.0
```

### Skia build (ninja)

Some Rust crates (e.g. the canvas backend) build Skia via `skia-bindings`, which requires `ninja` to be available on your system.

**macOS**

```bash
brew install ninja
ninja --version
```

**Ubuntu/Debian**

```bash
sudo apt-get update
sudo apt-get install -y ninja-build
ninja --version
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
> pnpm turbo build --filter @grida/canvas-wasm
> pnpm typecheck
> ```
>
> See [`AGENTS.md`](./AGENTS.md) ("Running `pnpm typecheck` from a clean checkout") for the full sequence.

## Packaging canvas wasm

```bash
just build canvas wasm
```

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
