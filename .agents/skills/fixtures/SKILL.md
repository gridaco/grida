---
name: fixtures
description: Guides authoring, organizing, and referencing test fixtures across the project. Use when creating new fixtures, writing tests that depend on fixtures, or deciding what should be checked into git.
---

# Fixtures

## What fixtures are

Fixtures are static input files — HTML, SVG, CSS, JSON, `.grida`, `.fig`,
font binaries, images, text samples — used as **deterministic inputs** to
rendering, parsing, and I/O tests. They exist so that tests are reproducible,
self-contained, and don't depend on external services or generated data.

## Why we keep them

- **Regression detection** — render the same input, compare the output.
- **Spec coverage** — each fixture maps to a specific feature or property
  being tested (one concept per file).
- **Onboarding** — new contributors can see exactly what the renderer handles
  by browsing fixtures.
- **Cross-pipeline validation** — the same fixture can be consumed by unit
  tests, golden tests, reftests, probe tests, and visual inspection.

## What should be covered

A fixture should exist for every **rendering behavior, format variant, or
edge case** that the codebase supports or intends to support. This includes:

- Each CSS property / SVG element the htmlcss or SVG renderer handles
- Format I/O round-trips (Figma → Grida, SVG → Grida, clipboard paste)
- Edge cases: zero-size, empty content, deeply nested, degenerate inputs
- Unsupported-but-tracked features (the fixture documents the gap)

## Best practices

- **One concept per file.** Don't combine unrelated properties.
- **Self-contained.** No external resources, network fetches, or scripts.
- **Minimal.** Only enough structure to isolate the behavior under test.
- **Probe-friendly.** High-contrast palette (prefer B/W), round pixel values,
  ≤ 3 colors. Designed for headless pixel probing, not human aesthetics.
- **Descriptive naming.** `<domain>-<property>[-<descriptor>].<ext>` — the
  filename alone should tell you what's being tested.
- **Labeled specimens.** Within a fixture, label each test case with the
  value being exercised so both humans and heuristics can identify regions.
- **Don't duplicate.** Before adding a fixture, check if an existing one
  already covers the behavior. Extend or split rather than duplicate.

## Git inclusion policy

### Checked in (`fixtures/`)

All directories under `fixtures/` **except `fixtures/local/`** are committed
to the repository. These are small, purpose-built files that are part of the
test suite.

```
fixtures/
├── css/              # CSS stylesheets
├── fonts/            # Bundled font binaries (deterministic text tests)
├── images/           # Test images
├── test-fig/         # Figma clipboard / REST fixtures
├── test-figma/       # Figma archive fixtures
├── test-grida/       # .grida format fixtures
├── test-html/        # HTML+CSS renderer fixtures (L0, etc.)
├── test-markdown/    # Markdown fixtures
├── test-svg/         # SVG fixtures
├── text/             # Plain text samples
└── local/            # ← gitignored, see below
```

### Not checked in (`fixtures/local/`)

`fixtures/local/` is **gitignored**. It holds large, third-party, or
benchmark-only datasets that are meaningful for local development but too
large or license-restricted for the repository:

- `W3C_SVG_11_TestSuite` — W3C SVG 1.1 conformance suite (~50 MB)
- `resvg-test-suite` — resvg's feature-focused SVG tests
- `oxygen-icons-5.116.0` — icon set for stress testing
- `perf` — large scenes for benchmarking

These must be downloaded separately by developers who need them.

## Referencing local-only fixtures

**Never reference `fixtures/local/` paths in committed code, tests, or
documentation.** Local fixtures do not exist in CI or on other developers'
machines. Specifically:

- Do not `include!()`, `read_to_string()`, or `fs::read()` a `local/` path
  in any Rust test or example that runs in CI.
- Do not hardcode `fixtures/local/` paths in docs, READMEs, or AGENTS files
  as if they are always available.
- If a doc needs to mention a local suite (e.g. for reftest instructions),
  clearly mark it as **local-only** and note that the developer must download
  it first.
- Tests that depend on local fixtures must be gated (e.g. `#[ignore]` with a
  comment, or behind a feature flag) so they don't fail in CI.
