# CI/CD Workflows

## Overview

| Workflow | Triggers | Purpose |
|----------|----------|---------|
| `test.yml` | push to `main`, all PRs | Lint + test all JS/TS packages |
| `test-crates.yml` | push to `main`, PRs touching `crates/` | `cargo test` + `cargo fmt --check` |
| `typos.yml` | push to `main`, all PRs | Spell checking via `crate-ci/typos` |
| `build-canvas.yml` | push to `main`/`canary` (when `crates/` changes), PRs touching `crates/` | Build WASM via Emscripten, upload artifact |
| `publish-canvas-wasm.yml` | chains from `build-canvas.yml`, manual dispatch | Publish `@grida/canvas-wasm` to npm |
| `check-generated-fbs.yml` | PRs touching `format/` or FBS files | Verify generated FlatBuffers code is up to date |
| `database-tests.yml` | PRs touching `supabase/` | Run Supabase migration tests |
| `realease-desktop-app.yml` | manual dispatch | Build and release Electron desktop app |

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
    → publishes to npm
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

### Path Filters

`build-canvas.yml` only triggers on push when these paths change:

- `.github/workflows/build-canvas.yml`
- `.github/workflows/publish-canvas-wasm.yml`
- `crates/**`

This prevents unnecessary WASM builds when only editor/package code changes.

### `workflow_run` Limitation

`publish-canvas-wasm.yml` uses `workflow_run` to chain from `build-canvas.yml`. GitHub requires `workflow_run` listeners to exist on the **default branch** (`main`). If the workflow file only exists on a feature branch, it will not trigger automatically. A stub file on `main` is sufficient for `workflow_dispatch` but not for `workflow_run`.

## Test Pipeline

### `test.yml` (test packages)

Runs on every PR regardless of path. Steps:

1. Checkout with `lfs: true` (`.fig` test fixtures are stored in Git LFS)
2. Download WASM artifacts from the latest successful `build-canvas.yml` run on `main`
3. If WASM artifacts are unavailable, `@grida/canvas-wasm` tests are skipped (the package's test script checks for the binary before running vitest)
4. Build all packages, lint, run tests

### `test-crates.yml` (test crates)

Runs on PRs touching `crates/`, `Cargo.lock`, or workflow files. Runs `cargo test` and `cargo fmt --check`.

## Known Issues

### Vercel editor build failure

The Vercel deployment for the editor (`grida`) fails because the WASM binary is not available at build time. Vercel runs its own build and does not have access to GitHub Actions artifacts. This needs a separate solution (e.g., installing `@grida/canvas-wasm` from npm during the Vercel build, or making the import lazy).

### `@grida/io-figma` test failures

The `.fig` test fixtures are stored in Git LFS. If the checkout does not include `lfs: true`, the fig-kiwi parser receives LFS pointer files instead of actual `.fig` binaries, causing parse errors like `Unexpected prelude: "version "`.

### PR checks not triggering

GitHub Actions may skip `pull_request` workflow triggers when a PR has merge conflicts (`mergeable: CONFLICTING`). Resolve conflicts to restore normal CI behavior.
