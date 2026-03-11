# Grida — agent guide (root)

This file is **for LLM agents** working anywhere in the Grida monorepo.

Read this first, then read the `AGENTS.md` for the specific directory you are working in — those files contain domain-specific rules, constraints, and checklists that are not repeated here.

---

## What is Grida

Grida is an open-source design tool aimed at providing a high-performance, configurable canvas-based editor.

**Mission**: Build a high-performance interactive graphics engine and its ecosystem.

**Core product areas**: canvas, forms, database.

---

## Quick navigation

When starting a task, find the right sub-directory AGENTS.md first:

| directory              | AGENTS.md                                              | importance    | notes                                                   |
| ---------------------- | ------------------------------------------------------ | ------------- | ------------------------------------------------------- |
| [editor](./editor)     | [`editor/AGENTS.md`](./editor/AGENTS.md)               | **Very high** | Next.js app powering grida.co and tenant sites          |
| [supabase](./supabase) | [`supabase/AGENTS.md`](./supabase/AGENTS.md)           | **Very high** | Database, RLS, migrations, security posture             |
| [crates](./crates)     | [`crates/grida-canvas/AGENTS.md`](./crates/grida-canvas/AGENTS.md) | **High** | Rust rendering engine (Skia-backed canvas)         |
| [format](./format)     | [`format/AGENTS.md`](./format/AGENTS.md)               | **High**      | `.grida` file format (FlatBuffers schema)               |
| [packages](./packages) | —                                                      | **High**      | Shared TypeScript packages (see each package's README)  |
| [docs](./docs)         | [`docs/AGENTS.md`](./docs/AGENTS.md)                   | Medium        | Documentation source of truth                           |
| [apps](./apps)         | —                                                      | Low           | Micro sites (e.g. `apps/docs` — Docusaurus)             |
| [desktop](./desktop)   | —                                                      | Low           | Electron desktop app                                    |
| [library](./library)   | —                                                      | Low           | Hosted library workers (Railway)                        |
| [jobs](./jobs)         | —                                                      | Low           | Hosted background jobs (Railway)                        |
| [.legacy](./.legacy)   | —                                                      | —             | **Fully ignore — pending removal**                      |

Also check for local `AGENTS.md` files within sub-paths (e.g. `editor/components/AGENTS.md`, `editor/kits/AGENTS.md`, tool-level files like `editor/app/(tools)/tools/halftone/AGENTS.md`).

---

## Key rules (monorepo-wide)

Things that cause problems if ignored:

- **Use `pnpm`** — never `npm install` or `yarn`. The workspace uses pnpm workspaces.
- **Never touch `.legacy/`** — this directory is pending removal; do not read or edit it.
- **Auth is off-limits**: `editor/app/(auth)` is security-critical — **do not modify** any routes or flows there.
- **Public API is backwards-compatible**: `editor/app/(api)/(public)/v1` — additive changes only; no breaking changes unless intentionally v2-ing.
- **No new `middleware.ts` in editor** — the edge entrypoint is `proxy.ts` (replaces `middleware.ts` under Next.js 16).
- **Production database is off-limits** — bots never have access to the main (production) Supabase project.
- **Code formatter is oxfmt (oxc)** — do not run `prettier` or other formatters directly on TypeScript/JavaScript files.
- **Turborepo manages the build graph** — use `turbo` commands rather than raw `tsc` or `next build` unless instructed otherwise.
- **Do not commit generated artifacts** — generated FlatBuffers bindings and other build outputs are not committed.

---

## Monorepo layout

```
/ (root)
├── editor/       Next.js app (grida.co + *.grida.site tenant sites)   ← Very high importance
├── packages/     Shared TypeScript packages                            ← High importance
├── crates/       Rust crates (Skia-backed canvas engine)               ← High importance
├── supabase/     Supabase project (migrations, schema, pgTAP tests)    ← Very high importance
├── format/       .grida file format spec (FlatBuffers)                 ← High importance
├── docs/         Documentation source of truth                         ← Medium importance
├── apps/         Micro sites (apps/docs, etc.)
├── desktop/      Electron desktop app
├── library/      Hosted library workers
├── jobs/         Hosted background jobs (Deno)
└── .legacy/      IGNORE — pending removal
```

---

## Languages and stack

| concern              | technology                                                         |
| -------------------- | ------------------------------------------------------------------ |
| Runtime              | Node.js 22                                                         |
| Language (TS)        | TypeScript 5                                                       |
| Language (Rust)      | Rust 2024 edition                                                  |
| Language (Python)    | Python 3.12 — isolated jobs/library only                           |
| Language (Deno)      | Deno — jobs that share the TS codebase                             |
| Web framework        | Next.js 16 + React 19                                              |
| UI                   | Tailwind CSS 4, Shadcn UI, Lucide / Radix Icons                    |
| Database             | Supabase (PostgreSQL)                                              |
| Graphics (2D)        | Skia via `skia-safe` (Rust crate)                                  |
| Graphics (DOM)       | Plain DOM canvas bound to React — website builder canvas           |
| Desktop              | Electron + Vite                                                    |
| Build orchestration  | Turborepo                                                          |
| Code formatter       | oxfmt (oxc)                                                        |
| Package manager      | pnpm                                                               |

---

## `/editor`

The editor is a Next.js monorepo app powering `grida.co` and tenant domains (e.g. `[tenant].grida.site`, custom domains).

See **[`editor/AGENTS.md`](./editor/AGENTS.md)** for the full "where to change what" map, multi-tenancy routing details, and key rules. A short summary of high-risk areas:

| area                              | rule                                                                            |
| --------------------------------- | ------------------------------------------------------------------------------- |
| `app/(auth)`                      | Security-critical. **Do not modify.**                                           |
| `app/(api)/(public)/v1`           | Public API. Additive changes only (backwards-compatible).                       |
| `proxy.ts`                        | Edge entrypoint (replaces `middleware.ts`). Do not add a new `middleware.ts`.   |
| `app/(workbench)`, `(workspace)`  | Performance-sensitive. Keep `use client` boundaries narrow.                     |
| `components/`                     | Route-agnostic, override-friendly UI primitives. See `components/AGENTS.md`.   |
| `kits/`                           | Stateful drop-in widgets; no global store coupling. See `kits/AGENTS.md`.       |
| `scaffolds/`                      | Feature assemblies; may bind to global/editor state.                            |
| `lib/`                            | Stable, non-opinionated modules — candidates for promotion to `/packages`.      |

---

## `/packages`

Shared TypeScript packages, some published to npm, some workspace-only.

Key group: **`packages/grida-canvas-*`** — powers the canvas. Large modules may still live under `/editor` and will progressively migrate to `/packages` as they stabilize.

For details on any individual package, read its own `README.md`.

---

## `/crates`

Rust implementation of the Grida Canvas — rapidly in development. It will serve as the new rendering backend once stable.

- Uses `skia-safe` for painting
- Uses `math2` crate for geometry / math

See **[`crates/grida-canvas/AGENTS.md`](./crates/grida-canvas/AGENTS.md)** for the NodeID system, testing commands, and available tooling.

---

## `/supabase`

Database, auth, and storage layer. See **[`supabase/AGENTS.md`](./supabase/AGENTS.md)** for the full security posture, RLS patterns, migration conventions, and pgTAP testing requirements.

Quick constraints:
- **RLS is mandatory** for any tenant/user data table.
- **Agents only run local commands** — never `supabase link`, `supabase db push`, or anything that could target the production project.
- Local commands: `supabase start/stop/status`, `supabase db reset`, `supabase migration new/up`, `supabase db test`.

Structure:
- `supabase/migrations/` — source of truth (applied SQL migrations)
- `supabase/schema/` — human-friendly organized schema reference (may drift; not ground truth)
- `supabase/tests/` — pgTAP security tests

---

## `/format`

The canonical on-disk contract: the `.grida` file format (FlatBuffers schema at `format/grida.fbs`).

See **[`format/AGENTS.md`](./format/AGENTS.md)** for schema evolution rules, breaking-change guidance, and the review checklist. Treat changes here like public API changes — they ripple into Rust and TypeScript codecs.

---

## `/docs`

Source of truth for documentation. Deployed at `https://grida.co/docs` via `apps/docs` (Docusaurus).

- **Actively maintained**: `docs/wg/**` and `docs/reference/**` only.
- **Do not edit** content outside those areas unless explicitly required.
- **Do not edit** generated artifacts under `apps/docs/docs/`.
- When linking to editor pages from docs, prefer **universal routing**: `https://grida.co/_/<path>`. See `docs/wg/platform/universal-docs-routing.md`.

---

## `/desktop`

Electron app that runs a hosted version of the editor. Low priority; uses Vite and electron-forge.

---

## `/jobs` and `/library`

Both hosted on Railway.com. Low priority for most tasks.

- `/jobs` — uses Deno and shares parts of the TS codebase.
- `/library` — Python 3.12 workers.

---

## Testing and development

All commands are run from the repo root unless noted. Use Turborepo for the monorepo; use `cargo` directly for Rust crates.

```sh
# --- TypeScript / Node ---

# recommended: test packages only (fast)
turbo test --filter='./packages/*'

# test packages + editor
pnpm turbo test --filter='./packages/*' --filter=editor

# build shared packages (required before typecheck)
turbo build --filter='./packages/*'

# build packages in watch mode
pnpm dev:packages

# typecheck (always run before considering work done)
turbo typecheck

# lint (CI enforces lint for Next.js apps)
turbo lint

# --- Rust ---

cargo test
cargo check --all-targets --all-features
cargo clippy --no-deps --all-targets --all-features
cargo build
cargo fmt --all
```

### Typecheck from a clean checkout

`pnpm typecheck` depends on compiled packages and the editor's Next.js env file. After a fresh clone or install:

```sh
pnpm install

# build shared packages and the wasm bundle
pnpm turbo build --filter="./packages/*"
pnpm turbo build --filter @grida/canvas-wasm

# typecheck
pnpm typecheck
```

> **Note**: `typecheck` depends on build artifacts. If it fails with missing types, build `/packages/*` first.

---

## Before submitting changes

- [ ] `turbo typecheck` passes (build packages first if needed).
- [ ] `turbo lint` passes (for TypeScript / Next.js changes).
- [ ] `cargo clippy --no-deps` passes (for Rust changes).
- [ ] You have **not** modified `editor/app/(auth)`.
- [ ] You have **not** added or edited anything in `.legacy/`.
- [ ] If you changed `supabase/`: RLS is enabled, policies are tenant-scoped, pgTAP tests are added/updated (see `supabase/AGENTS.md`).
- [ ] If you changed `format/grida.fbs`: Rust and TS codec ripple updates are applied (see `format/AGENTS.md`).
- [ ] If you changed public-facing docs: universal routing links are used where applicable.
