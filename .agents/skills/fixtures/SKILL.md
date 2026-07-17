---
name: fixtures
description: Guides authoring, organizing, and referencing test fixtures in this repo. Use when creating new fixtures, writing tests that depend on fixtures, or deciding what should be checked into git. Engine fixtures (rendering corpora) live in the engine repo.
---

# Fixtures

## What fixtures are

Fixtures are static input files — `.fig` archives, clipboard captures,
markdown samples, `.grida` documents — used as **deterministic inputs** to
parsing and I/O tests. They exist so that tests are reproducible,
self-contained, and don't depend on external services or generated data.

## Why we keep them

- **Regression detection** — parse the same input, compare the output.
- **Spec coverage** — each fixture maps to a specific feature or edge case
  being tested (one concept per file).
- **Onboarding** — new contributors can see exactly what the importers handle
  by browsing fixtures.

## Best practices

- **One concept per file.** Don't combine unrelated properties.
- **Self-contained.** No external resources, network fetches, or scripts.
- **Minimal.** Only enough structure to isolate the behavior under test.
- **Descriptive naming.** `<domain>-<property>[-<descriptor>].<ext>` — the
  filename alone should tell you what's being tested.
- **Don't duplicate.** Before adding a fixture, check if an existing one
  already covers the behavior. Extend or split rather than duplicate.

## The tree — who owns what

```
fixtures/
├── test-fig/         # Figma clipboard / .fig fixtures (LFS: *.fig, *.deck)
├── test-figma/       # Figma archive / REST fixtures
├── test-canvas/      # .canvas (dotcanvas) fixtures
├── test-markdown/    # Markdown fixtures
├── fonts/            # ← FROZEN SNAPSHOT (engine-owned)
├── images/           # ← FROZEN SNAPSHOT (engine-owned)
├── test-grida/       # ← FROZEN SNAPSHOT (engine-owned)
└── text-editor/      # ← FROZEN SNAPSHOT (engine-owned)
```

### Frozen snapshots

The engine repo owns the canonical, evolving copies of `fonts/`, `images/`,
`test-grida/` and `text-editor/` (its crates consume them at compile/test
time, with full git history carried over). The copies here exist only so
staying tests keep passing at their original paths — consumers:
`@grida/fonts`, `@grida/refig`, `@grida/io`, the editor reducer round-trip,
`@grida/text-editor`. **Do not edit them here**; re-snapshot deliberately
from the engine repo if the canon evolves. See
[`fixtures/README.md`](../../../fixtures/README.md).

**New engine fixtures** (rendering, SVG/HTML corpora, engine formats) go to
the engine repo: https://github.com/gridaco/nothing/tree/main/fixtures.
New fixtures for staying product code go in a grida-owned directory here.

## Local-only fixtures

Large, third-party, or license-restricted corpora are never committed —
the engine repo keeps its own gitignored `fixtures/local/` convention.
**Never reference a gitignored local path in committed code, tests, or
documentation** — it does not exist in CI or on other developers' machines.
If a doc must mention one (e.g. the refig corpus workflow in the io-figma
skill), clearly mark it **local-only** and note the download/build step.
