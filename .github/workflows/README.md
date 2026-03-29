# CI/CD Workflows

## Overview

| Workflow | Triggers | Purpose |
|----------|----------|---------|
| `test.yml` | push to `main`, all PRs | Lint + typecheck + test non-WASM packages |
| `test-canvas.yml` | push to `main`/`canary`, PRs touching `crates/` | Test WASM-dependent packages (editor, canvas-wasm, refig) |
| `test-crates.yml` | push to `main`, PRs touching `crates/` | `cargo test` + `cargo fmt --check` |
| `typos.yml` | push to `main`, all PRs | Spell checking via `crate-ci/typos` |
| `build-canvas.yml` | push to `main`/`canary` (when `crates/` changes), `workflow_call` | Build WASM via Emscripten, upload artifact |
| `publish-canvas-wasm.yml` | chains from `build-canvas.yml`, manual dispatch | Publish `@grida/canvas-wasm` to npm |
| `check-generated-fbs.yml` | PRs touching `format/` or FBS files | Verify generated FlatBuffers code is up to date |
| `database-tests.yml` | PRs touching `supabase/` | Run Supabase migration tests |
| `realease-desktop-app.yml` | manual dispatch | Build and release Electron desktop app |

## Test Pipeline

```
PR push (any file)
  ├─ test.yml (always)
  │   └─ lint, typecheck, test (non-wasm packages)
  │
  ├─ test-canvas.yml (only crates/ changed)
  │   ├─ build-wasm (calls build-canvas.yml)
  │   │   └─ Emscripten build → upload artifact
  │   └─ test
  │       └─ download artifact → test editor, canvas-wasm, refig
  │
  ├─ test-crates.yml (only crates/ changed)
  │   └─ cargo test, cargo fmt --check
  │
  └─ typos.yml (always)
```

### `test.yml` (test packages — fast path)

Runs on every PR regardless of path. Tests all JS/TS packages that do **not** depend on WASM:

```
--filter='!./crates/*' --filter='!@grida/canvas-wasm' --filter='!editor' --filter='!@grida/refig'
```

No WASM download needed. This is the fast-feedback path for most PRs (~2 min).

### `test-canvas.yml` (test WASM-dependent packages)

Only runs when `crates/` or its workflow files change. Steps:

1. Call `build-canvas.yml` as reusable workflow (builds WASM or re-uploads cached artifact)
2. Download WASM artifact (falls back to npm if unavailable)
3. Build `@grida/canvas-wasm` via tsup
4. Test `@grida/canvas-wasm`, `editor`, `@grida/refig`

### `test-crates.yml` (test crates)

Runs on PRs touching `crates/`, `Cargo.lock`, or workflow files. Runs `cargo test` and `cargo fmt --check`.

## WASM Build + Publish Pipeline

The `@grida/canvas-wasm` package is built from Rust source in `crates/` and published to npm automatically.

### Flow

```
push to main/canary (crates/ changed)
  → build-canvas.yml
    → compiles Rust → wasm32-unknown-emscripten
    → uploads artifact: grida-canvas-wasm.js + grida_canvas_wasm.wasm
  → publish-canvas-wasm.yml (workflow_run)
    → downloads artifact
    → builds JS wrapper (tsup)
    → publishes to npm (via pnpm publish)
```

### Versioning

- **canary branch**: `0.91.0-canary.<short-sha>` published with `--tag canary`
- **main branch**: `0.91.x` (patch bump) published with `--tag latest`
- Base version (`0.91.0`) is maintained in `crates/grida-canvas-wasm/package.json`
- Canary versions do NOT bump the base version — only the suffix changes

### npm Trusted Publishing

Publishing uses OIDC trusted publishers (no npm tokens stored in secrets).

**Requirements:**
- npm package must have a trusted publisher configured at npmjs.com pointing to `gridaco/grida`, workflow `publish-canvas-wasm.yml`, environment `npm-publish`
- GitHub environment `npm-publish` must exist with deployment branch policies for `main` and `canary`
- Node 24 is required in the publish workflow (npm >=11.5.1 for OIDC support)

### Why `pnpm publish`?

`lib/bin/.gitignore` (containing `*.wasm`, `*.js`) gets copied into `dist/` by tsup's `publicDir`. `npm publish` reads `dist/.gitignore` and excludes binaries from the tarball. `pnpm publish` ignores nested `.gitignore` files, so the tarball correctly includes all files.

## Vercel Deployment

### Deployment Checks

Vercel production deployments are gated by GitHub status checks. The `build-canvas` check must pass before a Vercel deployment is promoted to production. This is configured in Vercel's project settings under Deployment Protection → Deployment Checks.

### Editor build and WASM

The Vercel deployment for the editor (`grida`) requires the WASM binary at build time. Vercel runs its own build and does not have access to GitHub Actions artifacts.

**Current status**: The editor build fails on Vercel when crate changes are in-flight because the published npm version may not match the local source. This is a known limitation being addressed.

**Planned fix**: A prebuild script in the Vercel build command will install `@grida/canvas-wasm@canary` from npm before running `turbo build`, ensuring the WASM binary is available. The trade-off is that PRs changing both `crates/` and `editor/` in the same PR will use the previously-published WASM version until the new one is published.

## Known Issues

### `@grida/io-figma` test failures

The `.fig` test fixtures are stored in Git LFS. If the checkout does not include `lfs: true`, the fig-kiwi parser receives LFS pointer files instead of actual `.fig` binaries, causing parse errors like `Unexpected prelude: "version "`.

### PR checks not triggering

GitHub Actions may skip `pull_request` workflow triggers when a PR has merge conflicts (`mergeable: CONFLICTING`). Resolve conflicts to restore normal CI behavior.

### `workflow_run` Limitation

`publish-canvas-wasm.yml` uses `workflow_run` to chain from `build-canvas.yml`. GitHub requires `workflow_run` listeners to exist on the **default branch** (`main`). If the workflow file only exists on a feature branch, it will not trigger automatically. A stub file on `main` is sufficient for `workflow_dispatch` but not for `workflow_run`.
