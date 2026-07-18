# fixtures

Ownership map after the engine split (the Rust engine lives in
[gridaco/nothing](https://github.com/gridaco/nothing)):

## Grida-owned (live, evolve here)

- `test-fig/`, `test-figma/` — Figma import fixtures (LFS: `*.fig`, `*.deck`)
- `test-canvas/`, `test-markdown/` — dotcanvas / markdown fixtures

## FROZEN SNAPSHOTS — canon lives in the engine repo

The engine repo owns the canonical, evolving copies of these directories (its
crates consume them at compile/test time, with full git history carried over).
The copies here exist only so staying tests keep passing, at their original
paths, with zero churn:

- `fonts/` — consumed by `@grida/fonts` and `@grida/refig` tests
- `images/` — consumed by `@grida/io` archive tests
- `test-grida/` — consumed by `@grida/io` round-trip, editor reducer round-trip, bench utils
- `text-editor/` — consumed by `@grida/text-editor` shared-fixture tests

**Do not edit these here.** If the canon evolves and a staying consumer should
follow, re-snapshot deliberately from the engine repo. New fixture work for the
engine goes to the engine repo; new fixture work for staying product code goes
in a grida-owned directory.

## Untracked

- `local/` — gitignored, locally-downloaded corpora (resvg/W3C suites, perf
  profiles). The engine repo documents its own re-provisioning.
