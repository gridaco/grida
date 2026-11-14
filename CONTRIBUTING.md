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

From the repository root, install dependencies, build the shared packages, and
start the editor:

```bash
pnpm install
pnpm build:packages
pnpm dev:editor
```

The editor uses compiled workspace packages, so build them before starting it.
When editing shared packages, run `pnpm dev:packages` in a second terminal from
the repository root to rebuild them as they change.

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

To run Grida Desktop against this setup, use `just desktop`. It starts local
Supabase and the editor dev server when they are not running, then the
development app, and stops what it started when Desktop quits.

[`supabase/README.md`](./supabase/README.md) is the local-backend runbook.
[`supabase/seed.md`](./supabase/seed.md) documents the other seeded personas
for multi-tenant and no-organization testing.

## Application Rust and the graphics engine

The root Cargo workspace contains application crates, starting with the native
CLI under `crates/grida-cli`, with `grida-auth` and `grida-ai` libraries. Install
Rust through rustup; commands use the toolchain pinned in `rust-toolchain.toml`.
The `grida` npm package bundles all eight supported native executables and
launches the one matching the user's platform.

```sh
cargo build --workspace --locked
cargo fmt --all --check
cargo clippy --workspace --all-targets --all-features --locked -- -D warnings
cargo test --workspace --all-features --locked
just cli-contracts
```

The [contract guide](scripts/cli-contracts/README.md) explains reviewed command and
provider fixtures, current TS/Rust interoperability, and release acceptance
boundaries. Ordinary Rust builds need no Node code generation. `just cli-contracts`
builds current TS consumers and documentation after the normal pnpm install;
the complete gate also needs the platform's native keyring setup described in
that guide. It does not build the retired TypeScript CLI.

The Rust rendering engine (canvas WASM) is developed in
[gridaco/nothing](https://github.com/gridaco/nothing). The editor consumes the
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

## Grida Open API

Grida's public product APIs run in the separate [Nitro API application](apps/api/README.md).
Forms is its first product module, under `/v1/forms`; product-specific HTTP policy
stays within that namespace.
The editor and tenant UI use `NEXT_PUBLIC_GRIDA_OPEN_API_ORIGIN`; local development
normally pairs the editor on port 3000 with the API on port 4000 and the same local
Supabase project. See the [Forms proof guide](scripts/forms-local/README.md) for
disposable seeded database, Storage and HTTP verification.

## Pull requests

Choose a template by the effect of your change. Features and bug fixes can use
either template:

- **General** (default): changes without a user-facing effect, such as refactoring,
  infrastructure, dependencies, or documentation. Explain what changed, why, and
  how you verified it.
- **[Product & UX](https://github.com/gridaco/grida/compare?expand=1&template=product-ux.md)**:
  changes to user behavior, interactions, appearance, or visual output. Explain
  the user problem, resulting behavior, reproduction steps, and caveats, and
  include a working demo.

For applicable Product & UX changes, outside contributors must include screenshots
or a short demo video before the PR can be accepted. Grida's editor and visual
features depend on small details and edge cases that code review alone cannot
establish. Show the implementation running: screenshots suit static results such
as layout or styling; video/GIF suits interactions such as dragging, resizing, or
keyboard shortcuts. Explain what the demo shows, include before/after behavior
when useful, and note relevant limitations. A simple recording is enough;
narration is optional. If no meaningful visual demo applies, explain why in the
PR.

GitHub fills new PR descriptions with the default template. For Product & UX,
use the link above and select your branches, or add `template=product-ux.md` to
your PR creation URL's query parameters. With the GitHub CLI:

```sh
gh pr create --template product-ux.md --attach ./demo.mp4
# Or attach a demo to an existing PR:
gh pr edit <number> --attach ./demo.mp4
```

Attachments require `gh` v2.99+ and repository write access. Repeat `--attach` for
multiple files; contributors without write access can upload through GitHub's
web UI. See the [CLI attachment guide](https://github.blog/changelog/2026-09-01-github-cli-media-in-issues-pull-requests-and-comments/).
When supplying `--body` or `--body-file`, read the
[appropriate template](https://github.com/gridaco/grida/tree/main/.github) and
preserve its sections in your description.

## Support

If you have any problem running the project locally or for any further information, please contact us via Slack.

- [joining our slack channel](https://grida.co/join-slack)

**See Also**

- [AGENTS.md](./AGENTS.md) has a comprehensive list of the project structure and the purpose of each directory and file.
