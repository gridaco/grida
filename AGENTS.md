# Hi robots, welcome to the Grida project.

Grida is a open source Design tool that aims to provide high-performance, configurable canvas-based editor.

**Mission**

- Build a high performance interactive graphics engine and its ecosystem

Currently, we have below features / modules.

- canvas
- forms
- database

## Project Structure

- [docs](./docs) - the docs directory
- [format](./format) - grida file formats & schemas
- [editor](./editor) - the editor directory
- [crates](./crates) - the rust crates directory
- [packages](./packages) - shared packages
- [desktop](./desktop) - the electron desktop app
- [supabase](./supabase) - the supabase project
- [apps](./apps) - micro sites for Grida
- [library](./library) - hosted library workers
- [jobs](./jobs) - hosted jobs
- [.legacy](./legacy) - will be removed (fully ignore this directory)

## Languages, Frameworks, Tools, Infrastructures

**Languages**

- Node.js 22 - main runtime for most apps
- TypeScript 5 - main language for most apps
- Python 3.12 - partially used for tasks / jobs, that are independent, e.g. `/library`
- Deno - partially used for tasks / jobs, that shares the codebase, e.g. `/jobs`
- Rust (2024 edition) - used for wasm builds, mostly for graphics core.

**Database**

Grida heavily relies on Supabase (PostgreSQL).

- Supabase

**Web**

- React.js 19
- Next.js 16

**UI**

- Tailwind CSS 4
- Shadcn UI
- Lucide / Radix Icons

**Graphics Backend**

- DOM - plain dom as canvas - for website builder canvas. (binded with react)
- Skia - the graphics backend - for 2D graphics. (binded with skia-safe)

**Desktop**

- electron with electron-forge
- vite

## Documentation

Documentation files are located in the `./docs` directory.

This directory contains the docs as-is, the deployment of the docs are handled by [apps/docs](./apps/docs). A docusaurus project that syncs the docs content to its directory. When writing docs, the root `./docs` directory is the source of truth.

See [`docs/AGENTS.md`](./docs/AGENTS.md) for the docs contribution scope (we only actively maintain `docs/wg/**` and `docs/reference/**`).

## `/crates/*`

Importance: **High**

monorepo rust crates.

The rust implementation of the Grida Canvas. this is rapidly under development. - it will serve as our new rendering backend once it is stable.

## `/editor`

Importance: **Very high**

The editor is a monorepo nextjs project that contains the codebase for the editor.

grida.co and \[tenant\].grida.site domains are connected.

- `/editor`
  - `/app` the nextjs app directory, no shared root layout, each has its own root layout.
    - `(api)/(public)/v1` contains the public api routes.
    - `(api)/private` contains the private, editor only api routes.
    - `(auth)` contains the auth specific flow routes. do not modify.
    - `(insiders)` contains the insiders, local-only routes. e.g. Grida does not allow email signups, the insiders locally can.
    - `(library)` contains the Grida Library (open assets) specific pages.
    - `(preview)` contains the embed-purpose slave preview pages, maily used by the playground.
    - `(site)` similar to `(www)`, but contains pages that are not seo-purpose.
    - `(tenant)` contains the tenant-site rendered pages.
    - `(tools)` contains the standalone tools and editor pages, like playground, etc.
    - `(workbench)` contains the workbench, the main editor page.
    - `(workspace)` similar to `(workbench)`, but contains the dashboard, not the actual editor.
    - `(www)` contains the landing page, seo-purpose static pages. when to add new webpages, this is the root directory.
    - `sitemap.ts` contains the sitemap.xml generator. this contains the sitemap for the public pages, usually under `(www)` directory.
  - `/www` contains the landing page specific components.
  - `/components` contains the generally reusable components.
  - `/components/ui` contains the shadcn ui components.
  - `/scaffolds` contains the feature-specific larger components / pages / editors.
  - `/lib` contains the core, strictly designed modules with non-opinionated, reusable, and stable modules. - all of them must be worthy to be promoted to `<root>/packages` directory.
  - `/grida-*` aims to isolate the modules to a domain-specific scope. once reasonably well-defined, they will be promoted to `<root>/packages` directory.

## `/desktop`

Importance: **Low**

The desktop is a electron app that runs a hosted version of the editor. we choose this way to make things maintainable.
We choose electron for stability, consistency, and relies on chrome-specific functions.

## `/supabase`

Importance: **Very high**

We use supabase for database, auth, and storage.

- /supabase

  - ~~/functions~~ - we are not using supabase edge functions.
  - /migrations - applied migration sqls.
  - /schema - human friendly organized schema sqls.

- To run supabase locally, follow the instructions in the [supabase docs](https://supabase.com/docs/guides/local-development).
- To suggest a new feature, use `supabase migration new <feature-name>`.
- To apply migrations, use `supabase migration up`.

In any cases, bots will never have access to the main (production) database.

## `/jobs`

Importance: **Low**

Jobs are hosted on railway.com

## `/library`

Importance: **Low**

Library workers are hosted on railway.com

## `/packages/*`

Importance: **High**

monorepo node packages

**`/packages/grida-canvas-*`**

Packages that powers the canvas. (some are published to npm, some are not)

Since our project is in a rapid development, some large modules still lives under the `/editor` directory. Which will progressively move to `/packages` directory, once things are sorted out and fully defined with the good models.

For each individual package, refer to the README of its own.

## Testing & Development

We use turborepo (except few isolated packages).

To run test, build, and dev, use below commands.

```sh
# run tests (all, not recommended. requires crates build)
turbo test

# run tests for packages
turbo test --filter='./packages/*'

# build packages (required for typecheck for its dependants)
turbo build --filter='./packages/*'

# build packages in watch mode
pnpm dev:packages --concurrency 100

# run tests except for rust crates
turbo test --filter='!./crates/*'

# run build (all, not recommended)
turbo build

# run dev
turbo dev

# run typecheck (always run)
turbo typecheck # fallback when build fails due to network issues (nextjs package might fail due to font fetching issues)

# for crates specific tests
cargo test

# for crates specific check
cargo check

# for crates (with long build time deps, e.g. skia)
cargo clippy --no-deps

# for crates specific build
cargo build

# format crates
cargo fmt --all
```

Note: `typecheck` still rely on packages build artifacts, so it will fail if the build fails.
To handle this, you can build the `/packages/*`, then run typecheck. (when networking is not available)

### Running `pnpm typecheck` from a clean checkout

`pnpm typecheck` depends on compiled packages and the editor's Next.js env
file. After cloning the repo or installing dependencies, run the following
steps before executing `pnpm typecheck`:

```sh
pnpm install

# build shared packages and the wasm bundle
pnpm turbo build --filter="./packages/*"
pnpm turbo build --filter @grida/canvas-wasm

# finally, run the repository-wide typecheck
pnpm typecheck

# run test (only packages and editor)
pnpm turbo test --filter='./packages/*' --filter=editor
```
