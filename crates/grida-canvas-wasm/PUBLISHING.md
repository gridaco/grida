# Publishing `@grida/canvas-wasm`

**The publish flow is MANUAL.** Neither in-repo workflow has ever published a version:
`publish-canvas-wasm.yml` is a stub, and the `publish-grida-canvas-wasm` job in
`publish-packages.yml` has zero runs (push trigger disabled). Every published version — including
`0.91.0-canary.22` (2026-07-01) — was pushed by a maintainer from a local machine. This document is
that flow, written down before the knowledge moves.

## Prerequisites

- npm auth as an `@grida` scope member with publish rights (2FA)
- emsdk submodule initialized: `git submodule update --init third_party/externals/emsdk`
- Rust toolchain per `rust-toolchain.toml` (+ `wasm32-unknown-emscripten` target)

## Flow

```sh
# 1. build the wasm bundle (from this crate's directory; its justfile
#    activates emsdk via <repo-root>/bin/activate-emsdk and emsdk_env.sh)
cd crates/grida-canvas-wasm
just build

# 2. sanity: dist exists and the .wasm is real (≈17.6 MB, not a 130-byte LFS pointer)
ls -la lib/dist/

# 3. bump the version in lib/package.json (canary scheme: 0.91.0-canary.N)

# 4. publish the npm half
cd lib
npm publish --access public --tag latest   # dist-tag policy: `latest` tracks the freeze pin
```

## Post-publish

- Commit the version bump.
- If the published version is (or becomes) the freeze pin consumed by `gridaco/grida`, coordinate
  per the freeze contract before moving any dist-tag.
