---
name: cg-reftest
description: >
  Guides design and review of computer-graphics rendering tests for the
  cg crate. Covers the distinction between reftests (independent oracle)
  and golden/snapshot regression tests (previously accepted output).
  Use when adding, reviewing, or debugging visual comparison tests,
  pixel diffs, golden image generators, or SVG reftest suites.
  Relevant paths: crates/grida-canvas/tests/, crates/grida-canvas/goldens/,
  crates/grida-canvas/examples/golden_*, crates/grida-dev/src/reftest/,
  docs/wg/feat-svg/testing.md.
---

# CG Rendering Tests — Reftests & Golden Tests

How to design, name, and review visual rendering tests in this repo.

## When to Use This Skill

- Adding a new pixel-comparison test to `crates/grida-canvas/`
- Reviewing a PR that adds or updates golden images
- Deciding whether a test should be a reftest or a golden test
- Investigating a flaky or platform-dependent visual test
- Setting up tolerance thresholds for image diff
- Writing honest PR descriptions for rendering changes

---

## Terminology

Use these terms precisely. Misusing them erodes trust in test results.

| Term                               | Definition                                                                                                                                                                                                                                                          |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Reftest**                        | A test that compares renderer output against an **independent reference** (oracle) whose correctness is established outside this project — e.g. a W3C-provided PNG for an SVG test case. The oracle is the source of truth; a mismatch means our renderer is wrong. |
| **Independent reference / oracle** | A rendering produced by a separate, trusted implementation or defined by a specification. We do not control its content.                                                                                                                                            |
| **Golden test**                    | A test that compares renderer output against a **previously accepted snapshot** produced by our own renderer. There is no external truth — the golden file _is_ the expected output because a human reviewed and approved it. Also called a snapshot test.          |
| **Snapshot test**                  | Synonym for golden test. The snapshot is a frozen output that we assert has not changed.                                                                                                                                                                            |
| **Render regression test**         | Any test whose purpose is to detect _unintended changes_ in rendering output. Golden tests are regression tests. Reftests are correctness tests.                                                                                                                    |
| **Pixel diff**                     | Byte-level comparison of two raster images. A single differing channel value is a failure (at zero tolerance).                                                                                                                                                      |
| **Perceptual diff**                | Comparison in a perceptual color space (e.g. YIQ via the `dify` crate). Weights differences by human visual sensitivity. More forgiving than raw pixel diff but still quantifiable.                                                                                 |
| **Tolerance / fuzz**               | A configured threshold below which pixel differences are ignored. Expressed as a histogram threshold (rendiff) or a YIQ distance (dify). Required when rasterization is non-deterministic across platforms.                                                         |

---

## The Core Decision Rule

```
independent oracle exists?
  ├─ YES → reftest    (measures correctness against external truth)
  └─ NO  → golden test (detects regression against own prior output)
```

This is the only distinction that matters. Everything else — the diff
algorithm, the tolerance, the CI integration — is implementation detail.

---

## When to Use Each

### Reftests — spec-backed or standard formats

Use when a **trusted external reference** exists:

- **SVG rendering** — W3C SVG 1.1 Test Suite provides reference PNGs.
  Our `grida-dev reftest` runner compares against these.
  See `docs/wg/feat-svg/testing.md` and `crates/grida-dev/TESTING.md`.
- **resvg test suite** — feature-focused SVG tests with author-provided
  reference PNGs.
- **CSS properties** — when a CSS spec defines exact rendering behavior
  and a reference implementation provides ground truth.

A reftest failure means **our renderer has a bug** (or the spec changed).

### Golden tests — native/proprietary/internal formats

Use when **no external truth exists**:

- `.grida` scene rendering — our format, our renderer, no oracle.
- Custom effects (progressive blur, liquid glass, grain noise) — no
  spec defines what these should look like.
- Vector network rendering, boolean operations, layout engine output.
- Internal Skia pipeline behavior (corner smoothing, stroke decoration).

A golden test failure means **output changed** — it might be a bug, or
it might be a correct improvement. A human must decide.

The current golden infrastructure:

- **Generators**: `crates/grida-canvas/examples/golden_*.rs` — ~85 example
  binaries that render scenes and write PNGs to `crates/grida-canvas/goldens/`.
- **Storage**: `crates/grida-canvas/goldens/` — ~100 checked-in PNG files.
- **Comparison**: Currently manual. There is no automated golden comparison
  in `cargo test`. The only automated pixel-comparison test is
  `crates/grida-canvas/tests/flatten_rendiff.rs`, which is a self-referential
  test (shape path vs. its VN equivalent), not a golden comparison.

### Hybrid strategy

Use standardized formats (SVG) to harden renderer correctness first.
Once the low-level pipeline is correct against external oracles, add
native-format goldens for regression coverage of features that have
no spec.

Priority: fix reftest failures before updating goldens.

---

## Test Design Guidance

### Minimal fixtures

Each test should use the simplest possible scene that exercises the
target behavior. A gradient test should not also exercise clipping,
shadows, and text layout. Smaller fixtures make failures easier to
diagnose and diffs easier to review.

### One behavior per test

Name tests by the single behavior they verify:

```
flatten_rect_uniform_radius    — good (one shape, one variant)
render_everything              — bad  (what broke?)
```

When a behavior has meaningful variants, make each variant a separate
test or parameterize explicitly.

### Deterministic setup

- Pin all inputs: dimensions, colors, coordinates, font bytes.
- Avoid floating-point accumulation across frames (single-frame
  snapshots are best).
- Use fixed seeds for any procedural generation (noise, randomness).

### Avoid brittle tests

- Do not depend on system font fallback. Bundle test fonts in
  `fixtures/fonts/` and load them explicitly.
- Do not depend on locale, timezone, or environment variables.
- Do not compare text layout output pixel-for-pixel unless you
  control the exact font binary and shaper version.

---

## Determinism Concerns

Visual tests are uniquely sensitive to environment differences.
Understand these sources of non-determinism and handle each explicitly.

| Source                      | Problem                                                                                          | Mitigation                                                                                                                                   |
| --------------------------- | ------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| **Fonts**                   | System fonts differ across OS/version. Shaper versions produce different glyph outlines.         | Bundle exact font files. Load from `fixtures/fonts/`, never from the system.                                                                 |
| **Raster backend**          | Skia CPU vs GPU rasterize differently. Metal vs GL vs Vulkan differ.                             | Run golden comparisons on a single backend (CPU raster via `surfaces::raster_n32_premul`). Document which backend goldens were generated on. |
| **DPI / scale**             | HiDPI scaling changes pixel output.                                                              | Set explicit surface dimensions in pixels. Never rely on window/screen scale.                                                                |
| **Color / gamma**           | Color space handling varies. sRGB conversion rounding differs.                                   | Create surfaces with explicit `ColorSpace::new_srgb()`.                                                                                      |
| **Async resource loading**  | Images/fonts loaded asynchronously may not be ready at snapshot time.                            | Use synchronous loading for tests. Wait for all resources before rendering.                                                                  |
| **Antialiasing / subpixel** | AA algorithms differ across backends and Skia versions. Subpixel text rendering is OS-dependent. | Disable subpixel positioning in tests. Accept AA differences via threshold (see `flatten_rendiff.rs`: threshold `[(10, MAX), (60, 300)]`).   |

---

## Diff Policy

### When pixel-perfect diff is required

- Algorithmic correctness tests where both sides are computed on the
  same backend in the same process (e.g. `flatten_rendiff.rs` comparing
  shape path vs. VN path — same Skia, same surface, same frame).
- Data roundtrip tests (encode → decode → re-render must be identical).

Even here, AA edge differences may require a small threshold.

### When tolerance is justified

- Cross-platform CI where the golden was generated on a different OS
  or Skia version.
- Perceptual diff for SVG reftests where minor AA/hinting differences
  are acceptable (use `dify` with `--threshold` and `--aa`).
- Text rendering tests (shaper differences are inevitable across
  environments).

Document the tolerance and the reason in a comment next to the
threshold value. Never use a high tolerance to paper over a real bug.

### Reviewing changed goldens

When a PR updates golden images:

1. **Verify the rendering change is intentional.** Read the code diff
   first. Understand _why_ output changed.
2. **Visually inspect the diff.** Open old and new PNGs side by side.
   If the diff image is available, review it. Look for regressions in
   areas unrelated to the stated change.
3. **Check for collateral damage.** If only one golden should change
   but five did, that is a red flag.
4. **Require an explanation.** The PR description must state what
   changed and why. "Updated goldens" is not sufficient.

### Never auto-accept changed goldens

A script that regenerates all goldens and commits them defeats the
entire purpose of regression testing. Every golden update must be
individually justified. If you regenerate, review each changed file.

---

## Honest Wording for Docs and PRs

### Reserve "reftest" for true reference-backed correctness checks

The SVG test suite comparisons via `grida-dev reftest` are genuine
reftests — they compare against W3C-provided reference images.

The `flatten_rendiff.rs` tests are **self-consistency tests** — they
verify that two internal code paths produce equivalent output. They
are not reftests because neither side is an external oracle. Call them
"pixel-comparison tests" or "equivalence tests."

The `golden_*.rs` examples produce **golden/reference snapshots**.
Comparisons against them are **regression tests**, not reftests.

### Naming guidance

| What it is                                  | Call it                                     | Do NOT call it             |
| ------------------------------------------- | ------------------------------------------- | -------------------------- |
| Comparison against W3C/spec reference PNG   | reftest, reference test                     | snapshot test              |
| Comparison against our own prior output     | golden test, regression test, snapshot test | reftest                    |
| Two internal paths compared for equivalence | equivalence test, pixel-comparison test     | reftest                    |
| Any image comparison (generic)              | visual comparison, image diff               | reftest (unless it is one) |

In PR titles:

```
# Good
fix(svg): improve radial gradient accuracy (reftest S95→S99)
feat(vn): add star corner radius — update golden
fix(painter): correct blend mode — golden updated, verified manually

# Bad
fix: update reftests           ← (were they reftests or goldens?)
chore: regenerate snapshots    ← (why? what changed?)
```

---

## Anti-Patterns

| Anti-pattern                                                   | Why it's harmful                                                                                        | Instead                                                                                                        |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Calling every image comparison a "reftest"                     | Inflates confidence. Reviewers assume external validation when there is none.                           | Use correct terminology (see table above).                                                                     |
| Auto-regenerating all goldens in CI                            | Silently accepts regressions.                                                                           | Fail the build on mismatch. Require manual review and explicit commit.                                         |
| Giant fixture scenes that test many features at once           | A single pixel change anywhere fails the test. Impossible to diagnose.                                  | One behavior per test. Minimal fixtures.                                                                       |
| Tolerance so high it hides real bugs                           | e.g. allowing 20% pixel mismatch "because fonts differ"                                                 | Fix the determinism problem (bundle fonts, pin backend). Lower the threshold.                                  |
| Goldens generated on a developer laptop with different Skia/OS | CI will always fail, leading to threshold inflation or disabled tests.                                  | Generate goldens in the same environment CI uses, or document the environment and accept controlled tolerance. |
| Committing golden updates without code changes                 | Suggests the golden drifted due to environment, not intentional improvement. Investigate.               | Find the root cause. Pin the environment or fix the non-determinism.                                           |
| Testing only the happy path                                    | Regressions often appear at edge cases: zero-size shapes, degenerate paths, extreme zoom, empty scenes. | Add edge-case tests explicitly.                                                                                |

---

## Examples

### True reftest — SVG rendering against W3C reference

```bash
# Run SVG reftests against W3C suite
cargo run -p grida-dev -- reftest \
  --suite-dir fixtures/local/W3C_SVG_11_TestSuite \
  --bg white

# Result: report.json with per-test similarity scores.
# A score < 1.0 means our SVG renderer deviates from the W3C reference.
# This is a genuine reftest — the W3C PNG is the oracle.
```

In a PR: _"SVG reftest: shapes-rect improved from S90 to S99 after
fixing corner radius handling."_

### Golden/regression test — custom effect

```bash
# Regenerate the golden for progressive_blur after a shader change
cargo run -p cg --example golden_progressive_blur

# Visually inspect the diff
# (manually compare goldens/progressive_blur.png before and after)
git diff --stat  # confirm only the expected golden changed
```

In a PR: _"Updated `progressive_blur` golden — blur kernel changed from
3-pass box to 2-pass Gaussian. Visual diff reviewed: smoother falloff at
edges, no unrelated changes."_

### Self-consistency test — flatten pipeline equivalence

```rust
// From crates/grida-canvas/tests/flatten_rendiff.rs
// This is NOT a reftest. Neither side is an external oracle.
// It verifies that shape→path and shape→VN→path produce equivalent pixels.
#[test]
fn flatten_rect_uniform_radius() {
    let original = render_to_rgba(&build_rrect_path(&shape), w, h);
    let vn_path  = build_rrect_vector_network(&shape).to_paths();
    let flattened = render_to_rgba(&vn_path[0], w, h);
    assert_rendiff_match("rect_uniform_radius", original, flattened, w, h);
}
```

In a PR: _"Added pixel-comparison test for rect flatten with uniform
corner radius. Verifies VN path equivalence, not external correctness."_

---

## PR / Review Checklist

Use this when adding or reviewing rendering tests.

- [ ] **Correct category.** Is this a reftest, golden test, or equivalence test? Is it labeled correctly in code comments, test names, and PR description?
- [ ] **Minimal fixture.** Does the test use the simplest scene that exercises the behavior?
- [ ] **One behavior.** Does each test verify a single rendering behavior?
- [ ] **Deterministic.** Are fonts bundled? Is the surface size explicit? Is there a fixed seed for procedural content?
- [ ] **Threshold justified.** If tolerance is non-zero, is there a comment explaining why?
- [ ] **Golden diff reviewed.** If golden images changed, has each change been visually inspected and explained?
- [ ] **No bulk golden regeneration.** Were goldens updated individually with stated reasons?
- [ ] **Edge cases.** Are zero-size, empty, and degenerate inputs tested?
- [ ] **Environment documented.** If goldens are platform-sensitive, is the generation environment stated?
- [ ] **Honest wording.** Does the PR title/description use correct terminology?
