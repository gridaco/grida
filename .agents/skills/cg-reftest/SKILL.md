---
name: cg-reftest
description: >
  Design, review, and debug visual rendering tests: reftests (independent
  oracle), golden/snapshot regression tests, probe tests (pixel assertions
  without vision), SVG reftest suites, and Figma refig suites. Use when
  adding pixel diffs, choosing an oracle strategy, or comparing renderer
  output against a ground truth.
---

# CG Rendering Tests — Reftests & Golden Tests

How to design, name, and review visual rendering tests in this repo.

## When to Use This Skill

- Adding a new pixel-comparison test to `crates/grida-canvas/`
- Reviewing a PR that adds or updates golden images
- Deciding whether a test should be a reftest, golden test, or probe test
- Designing a fixture that can be verified without vision input
- Investigating a flaky or platform-dependent visual test
- Setting up tolerance thresholds for image diff
- Writing honest PR descriptions for rendering changes

---

## Terminology

Use these terms precisely. Misusing them erodes trust in test results.

| Term                               | Definition                                                                                                                                                                                                                                                                |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Reftest**                        | A test that compares renderer output against an **independent reference** (oracle) whose correctness is established outside this project — e.g. a W3C-provided PNG for an SVG test case. The oracle is the source of truth; a mismatch means our renderer is wrong.       |
| **Independent reference / oracle** | A rendering produced by a separate, trusted implementation or defined by a specification. We do not control its content.                                                                                                                                                  |
| **Golden test**                    | A test that compares renderer output against a **previously accepted snapshot** produced by our own renderer. There is no external truth — the golden file _is_ the expected output because a human reviewed and approved it. Also called a snapshot test.                |
| **Snapshot test**                  | Synonym for golden test. The snapshot is a frozen output that we assert has not changed.                                                                                                                                                                                  |
| **Render regression test**         | Any test whose purpose is to detect _unintended changes_ in rendering output. Golden tests are regression tests. Reftests are correctness tests.                                                                                                                          |
| **Pixel diff**                     | Byte-level comparison of two raster images. A single differing channel value is a failure (at zero tolerance).                                                                                                                                                            |
| **Perceptual diff**                | Comparison in a perceptual color space (e.g. YIQ via the `dify` crate). Weights differences by human visual sensitivity. More forgiving than raw pixel diff but still quantifiable.                                                                                       |
| **rendiff**                        | Rust crate (`rendiff` v0.2) for histogram-based pixel diffing. Computes a per-channel difference histogram; thresholds are expressed as `[(max_diff, max_count), ...]` pairs. Used in `flatten_rendiff.rs` for equivalence tests. Dep in `crates/grida-canvas/`.          |
| **dify**                           | Rust crate for perceptual image comparison in YIQ color space. Used by `grida-dev reftest` for SVG reftests. Supports `--threshold` and `--aa` (anti-aliasing detection) flags.                                                                                           |
| **pixelmatch**                     | Pure-JS perceptual image comparison library. YIQ-based, AA-aware. Used by `@grida/reftest`. Zero native deps; same conceptual model as dify, slightly different threshold semantics — see parity notes below.                                                             |
| **`@grida/reftest`**               | General-purpose, language-agnostic TS reftest CLI + library at `packages/grida-reftest/`. Takes two directories of PNGs, diffs, scores, writes the same bucket layout and JSON report as the Rust `grida-dev reftest`. Does NOT render anything — producers upstream.     |
| **`grida-dev reftest`**            | Rust reftest runner at `crates/grida-dev/src/reftest/`. SVG-specific: renders SVG via our own cg pipeline, then diffs against a reference PNG. Canonical for SVG. For non-SVG formats, use `@grida/reftest` with an upstream renderer.                                    |
| **refig**                          | Short for "Figma reftest." Fixture suites under `fixtures/local/refig/` containing `.fig` + `document.json` + `images/` + `exports/` (oracle PNGs from Figma's Images API). Consumed by a TS render step + `@grida/reftest`. See `fixtures/local/refig/README.md`.        |
| **refbrowser**                     | Short for "headless-browser reftest." HTML/CSS fixtures under `fixtures/test-html/L0/` rendered by Playwright Chromium as the oracle vs. our `cg` htmlcss renderer. Producer script: `.agents/skills/cg-reftest/scripts/refbrowser_render.ts`; diff via `@grida/reftest`. |
| **Tolerance / fuzz**               | A configured threshold below which pixel differences are ignored. Expressed as a histogram threshold (rendiff) or a YIQ distance (dify / pixelmatch). Required when rasterization is non-deterministic across platforms.                                                  |
| **Data test**                      | A test that asserts on the scene graph or computed values directly — no rendering needed. E.g. bounding box, resolved transform matrix, computed style. The cheapest possible assertion.                                                                                  |
| **Probe test**                     | A test that asserts correctness by reading pixel values at specific coordinates in the rendered output. Requires a purpose-built fixture with a minimal color palette and documented probe points. No full-image comparison needed.                                       |
| **Probe-friendly fixture**         | A fixture explicitly designed for probe testing: minimal colors, no decorative elements, shapes at known coordinates. Often accompanied by a `.probe.json` file declaring expected pixel values at specific points.                                                       |

---

## The Core Decision Rule

```
can correctness be asserted without rendering?
  ├─ YES → data test  (assert on scene graph, computed values, bounding boxes)
  └─ NO  → need pixels
      ├─ independent oracle exists?
      │   ├─ YES → reftest         (compare against external truth)
      │   └─ NO
      │       ├─ probe-friendly fixture? (minimal palette, known coords)
      │       │   ├─ YES → probe test  (read pixel values at specific points)
      │       │   └─ NO  → golden test (diff against prior accepted output)
      │       └─ (when in doubt → golden test)
```

Prefer the cheapest method that still validates the behavior. Data tests
are free (no render), probe tests are cheap (render but no diff), golden
tests and reftests are expensive (full image comparison).

---

## When to Use Each

### Data tests — no render needed

Use when the behavior can be verified on the **data model directly**:

- Computed bounding boxes, resolved transform matrices, layout positions.
- Scene graph structure (parent/child, ordering, visibility flags).
- Style resolution (computed fill, stroke, opacity values).
- Path math (point-on-curve, intersection, winding number).

If the assertion doesn't need pixels, don't render. Data tests are
instant, deterministic, and platform-independent.

### Reftests — spec-backed or standard formats

Use when a **trusted external reference** exists:

- **SVG rendering** — W3C SVG 1.1 Test Suite provides reference PNGs.
  Our `grida-dev reftest` runner compares against these.
  See `docs/wg/feat-svg/testing.md` and `crates/grida-dev/TESTING.md`.
- **resvg test suite** — feature-focused SVG tests with author-provided
  reference PNGs.
- **Figma files (refig)** — Figma's own Images API renders every node
  with an `exportSettings` preset; those PNGs are the oracle. Consumed
  by a TS render step + `@grida/reftest`. See the Figma section below.
- **CSS properties** — when a CSS spec defines exact rendering behavior
  and a reference implementation provides ground truth.

A reftest failure means **our renderer has a bug** (or the spec changed,
or — for refig — Figma's server-side renderer changed).

### Two reftest runners, one report format

Two tools implement the diff/score/report side of reftests. Pick by the
producer:

| Runner              | Language | Render path                      | Diff engine | Use when                                                            |
| ------------------- | -------- | -------------------------------- | ----------- | ------------------------------------------------------------------- |
| `grida-dev reftest` | Rust     | SVG → cg → PNG (built-in)        | dify        | SVG suites (W3C, resvg); renderer runs in-process                   |
| `@grida/reftest`    | TS       | None — you produce PNGs upstream | pixelmatch  | Figma refig, any cross-language producer, re-diff without re-render |

Both write the **same bucket layout** (`S99/S95/S90/S75/err`) and the
**same `report.json` schema**. A parity test at
`packages/grida-reftest/__tests__/parity.test.ts` asserts the two
tools grade a fixture pair to within ±0.005 similarity and the same
bucket. Do not let them drift — update this table and both tools if
the contract ever changes.

---

## Oracle Strategies by Input Format

The oracle source depends on the format being tested. Choose the right
strategy before authoring a new fixture.

### SVG — pre-baked reference vs. resvg-generated reference

Two strategies, depending on whether a reference image already exists:

**Strategy A — pre-baked reference (preferred when available)**

Use if the SVG comes from a test suite that ships reference PNGs alongside it
(W3C SVG 1.1, resvg-test-suite, Oxygen Icons). The oracle is the co-located
PNG; `grida-dev reftest` picks it up automatically via `reftest.toml`.

```sh
# W3C suite — reference PNGs are in png/ next to svg/
cargo run -p grida-dev --release -- reftest \
  --suite-dir fixtures/local/W3C_SVG_11_TestSuite --bg white
```

**Strategy B — resvg as dynamic oracle (when no pre-baked image exists)**

For arbitrary SVG files with no reference PNG, resvg is an independent,
conformant SVG renderer that can serve as the oracle. Run resvg on the SVG to
produce a reference PNG, commit it, then run the normal reftest against it.

```sh
# Install resvg CLI
cargo install resvg  # or: brew install resvg

# Render SVG → reference PNG at the exact viewport size
resvg input.svg reference.png --width 512 --height 512

# Store alongside the SVG fixture; reference is the oracle
```

This is still a genuine **reftest** — resvg is an independent implementation,
not our own renderer. A mismatch means our renderer diverges from the SVG spec
(or resvg has a bug, which can be checked upstream).

**Choosing between strategies:**

- Pre-baked PNG present? → use it (Strategy A).
- No pre-baked PNG, SVG content is standard/spec-compliant? → generate via resvg (Strategy B).
- SVG content is non-standard or uses Grida-specific extensions? → golden test (see below).

---

### Figma — the refig reftest pipeline

Figma content has **no pre-baked oracle** — the oracle is Figma's own
server-side renderer, accessed via the Images API. The full, end-to-end
refig suite has four pieces, all living under `fixtures/local/refig/`
(gitignored):

```
fixtures/local/refig/<name>.<filekey>/
├── document.fig      .fig binary (manual File → Save local copy in Figma desktop)
├── document.json     REST: GET /v1/files/:key?geometry=paths
├── images/           Image fills from GET /v1/files/:key/images
└── exports/          Oracle PNGs: one per node with non-empty exportSettings
    └── <node-id>.png (colon-sanitized: 1:5216 → 1_5216.png)
```

Nodes must have **export presets configured in Figma** before archiving
(select → right panel → Export +). The REST API does not expose
`exportSettings` for `SECTION` nodes (figma/rest-api-spec#87) — use
`FRAME`, `COMPONENT`, or `INSTANCE`. Without exports there is no oracle;
a comparison against our own renderer's output is a **golden test**,
not a reftest.

**1. Archive + export oracle PNGs** — `figma_archive.py --export`
writes `document.json`, `images/`, and `exports/` in one call. See the
script header for flags, prerequisites, and limitations.

```sh
python .agents/skills/io-figma/scripts/figma_archive.py \
  --filekey <figma-file-key> \
  --archive-dir fixtures/local/refig/<name>.<filekey> \
  --export
```

Requires `FIGMA_TOKEN` or `X_FIGMA_TOKEN` in the process environment —
the script does NOT auto-load `.env`. Requires Python 3.10+ (uses
`str | None`); on macOS default Python 3.9 use Homebrew's `python3.12`.

**2. Drop the `.fig` binary in** — File → Save local copy in Figma
desktop, save as `document.fig` inside the suite directory. The REST
API has no `.fig` download endpoint.

**3. Render with our import pipeline** — Produce per-node actual PNGs
with the TS-side `@grida/io-figma` pipeline (`.fig` via fig-kiwi, or
`document.json` via REST converter). The renderer consumes a node's
`exportSettings` to match Figma's target size/scale per export preset;
one actual PNG per oracle PNG, filenames matched by Figma node id.

Writes actuals to an out-of-tree directory (e.g.
`target/refig/<name>/renders/`), one PNG per node, filename matching
`exports/<node-id>.png`.

**4. Diff via `@grida/reftest`** — The diff/score/report step is
format-agnostic:

```sh
npx reftest \
  --actual-dir   target/refig/<name>/renders \
  --expected-dir fixtures/local/refig/<name>.<filekey>/exports \
  --output-dir   target/reftests/<name> \
  --bg white --mask alpha
```

Or the programmatic API from a TS test:

```ts
import { reftest } from "@grida/reftest";

const report = await reftest({
  name: "<name>",
  expectedDir: "fixtures/local/refig/<name>.<filekey>/exports",
  actualDir: "target/refig/<name>/renders",
  outputDir: "target/reftests/<name>",
  bg: "white",
  scoring: { mask: "alpha" },
});
```

Output: S99/S95/S90/S75/err bucket directories and a `report.json`
compatible with the Rust reftest schema. An `average_similarity < 0.9`
is the threshold where the renderer needs attention.

**Gotchas for refig:**

- The `exports/` oracle is non-deterministic across regenerations. Figma
  may upgrade its server-side renderer; running `figma_archive.py
--export` again may produce slightly different PNGs. Treat a
  regeneration as a new oracle baseline, not a drop-in replacement.
- Image fills live in `images/` and must be wired into the render step
  (either pointed at the directory or packed into a `.grida` archive via
  `fig2grida`).
- Per-node target sizes come from the node's `exportSettings` in
  `document.json` — not from a suite-wide viewport. The render step
  must honor each node's preset.

### HTML/CSS — the refbrowser reftest pipeline

HTML/CSS fixtures have **no pre-baked oracle** — the oracle is a real
browser engine. Like refig, refbrowser renders the same fixture in two
places and diffs the PNGs; unlike refig, both renders are reproducible
locally (no cloud round-trip).

```
fixtures/test-html/
├── L0/<name>.html                 ── fixtures
├── _reftest/hide-text.css         ── shared helper stylesheets
└── suites/
    ├── L0.exact.json              ── must pass 100.00%; CI gate
    └── L0.coverage.json           ── aspirational scope; tracks progress

        │
        ├── cargo run -p cg --example golden_htmlcss -- --suite <suite>
        │       └─► $TMPDIR/grida-htmlcss-goldens/<name>.png   (cg actual)
        │
        └── refbrowser_render.ts --suite <suite>
                └─► target/refbrowser/<suite>/expected/<name>.png   (Chromium oracle)

                        ▼
                reftest --actual-dir … --expected-dir … --threshold 0
                        └─► target/reftests/<suite>/report.json + buckets
```

**Oracle**: headless Chromium via Playwright. Chromium's Blink is the
reference implementation for most CSS features; divergence from Blink
is a gap in our `cg` htmlcss pipeline (or a known difference documented
in `docs/wg/feat-2d/htmlcss.md`).

> **See also: web-platform-tests (WPT).** The W3C's
> [wpt.live](https://wpt.live) suite is the standards-body reftest
> harness — same concept as refbrowser, but cross-engine (Blink,
> WebKit, Gecko) and backed by spec-author-written fixtures with
> explicit pass criteria. Consider pulling WPT fixtures into
> `fixtures/test-html/` when a CSS feature has a mature WPT section
> and you want spec-conformance signal rather than just "matches
> Chromium." Out of scope for this skill today; refbrowser is the
> faster local loop.

#### Suites: `L0.exact` vs `L0.coverage`

Everything is driven by **suite JSON files** at
`fixtures/test-html/suites/`. A suite enumerates fixtures, their
per-fixture render config, and the gate policy.

| Suite              | What it contains                                                                              | Gate                       |
| ------------------ | --------------------------------------------------------------------------------------------- | -------------------------- |
| `L0.exact.json`    | Fixtures currently at 100.00% byte-exact parity with Chromium. Any drop is a real regression. | `floor: 1.0`, strict diff. |
| `L0.coverage.json` | All aspirational L0 fixtures — the full backlog. Scores land wherever they land.              | Informational only.        |

**Promoting a fixture to `exact`** — once a fixture reaches 100.00%
against the current suite config, move its entry from `coverage` →
`exact`. Do **not** lower the exact suite's floor to fit new entries;
the bar exists so regressions are loud.

Per-fixture `.reftest.json` sidecars **do not exist** anymore. All
config lives in the suite file.

#### Suite JSON shape

```json
{
  "name": "L0.exact",
  "description": "Byte-exact fixtures; any drop = regression.",
  "gate": { "threshold": 0, "aa": false, "floor": 1.0 },
  "defaults": {
    "wait_for": ["fonts", "networkidle"],
    "extra_css": ["../_reftest/hide-text.css"],
    "full_page": true
  },
  "fixtures": [
    {
      "path": "../L0/box-dimensions.html",
      "viewport": { "width": 600, "height": 522 }
    }
  ]
}
```

- `defaults` — applied to every fixture. Each fixture entry can override any field.
- `fixtures[].path` and every `extra_css[]` path resolve **relative to the suite file**.
- `viewport.height` must match cg's cull height for the diff to succeed; render cg once and read `WxH` to calibrate.
- `gate.threshold` / `gate.aa` are inputs to the pixelmatch diff; `gate.floor` is the aggregate pass bar on similarity.

#### The three-step pipeline

**1. Render expecteds (browser oracle)**

```sh
# one-time: install Chromium for Playwright
pnpm --filter @grida/reftest exec playwright install chromium

# render the whole suite
pnpm --filter @grida/reftest exec tsx \
  .agents/skills/cg-reftest/scripts/refbrowser_render.ts \
  --suite   fixtures/test-html/suites/L0.exact.json \
  --out-dir target/refbrowser/L0.exact/expected
```

Ad-hoc single-file render (no suite, defaults only) — useful while authoring a fixture:

```sh
pnpm --filter @grida/reftest exec tsx \
  .agents/skills/cg-reftest/scripts/refbrowser_render.ts \
  --fixture fixtures/test-html/L0/paint-background-solid.html \
  --out-dir /tmp/refbrowser-verify
```

**2. Render actuals (our pipeline)** — the `golden_htmlcss` example
reads the same suite JSON, resolves `extra_css` relative to the suite
file, and applies each stylesheet via
`htmlcss::with_extra_stylesheets` before rendering, so the cascade is
symmetric with Chromium.

```sh
cargo run -p cg --example golden_htmlcss -- \
  --suite fixtures/test-html/suites/L0.exact.json

mkdir -p target/refbrowser/L0.exact/actual
cp "${TMPDIR:-/tmp}/grida-htmlcss-goldens/"*.png target/refbrowser/L0.exact/actual/
```

**3. Diff via `@grida/reftest`** — format-agnostic, same bucket layout
and `report.json` schema as the Rust and refig runners.

Default refbrowser diff: **`--threshold 0`** (pixelmatch strictest,
AA off). Pass each fixture's similarity against the suite's
`gate.floor` — for `L0.exact`, that's `1.0` (100.00% byte-exact).

```sh
pnpm --filter @grida/reftest exec reftest \
  --actual-dir   target/refbrowser/L0.exact/actual \
  --expected-dir target/refbrowser/L0.exact/expected \
  --output-dir   target/reftests/L0.exact \
  --bg white \
  --threshold 0
```

> **Gate enforcement is not yet wired into the CLI.** Today, read
> `report.json` and assert every `tests[].similarity_score ≥
gate.floor` in a wrapper script or CI step. A `--suite` flag on
> `@grida/reftest` that does this automatically is a pending
> follow-up.

Output: `S99/S95/S90/S75/err/` bucket directories + `report.json`.
Pass bar: the suite's `gate.floor`. For `L0.exact`, anything below
100.00% is a real divergence from Blink (rounding policy, layout
math, AA emission, etc.) — not noise. See "Reading the score" below.

### Reading the score — do not trust it naively

The similarity score is `1 - diff_pixels / scoring_pixels`, where
`scoring_pixels ≈ width × height` of the screenshot. **The denominator
is the whole canvas, not the subject under test.**

This has two consequences you must internalize before reading any
report:

1. **Background dominates the score.** A fixture that paints a
   100×100 subject on a 600×800 canvas has 92% background. A renderer
   that emits _nothing_ for the subject still scores ~92%. A
   renderer that paints the subject at 50% accuracy scores ~96%.
   Neither number means what it naively looks like.
2. **Small fixtures inflate. Full-bleed fixtures are honest.** A
   card-in-corner composition will always look "good" on the score
   even when broken; a composition that fills the viewport gives
   numeric feedback proportional to real error.

**Fixture-authoring rule:** size the fixture so the subject under
test fills as much of the canvas as practical. Viewport height
tuned to the subject's bounding box (via the suite entry's
`viewport.height`) is the usual lever. Padding/margins around the
subject are scoring dead weight — use them only when the test is
_about_ spacing.

**Reviewing rule:** never report a similarity number without
eyeballing the diff PNG. A 96% score on a sparse fixture and a 96%
score on a full-bleed fixture are _orders of magnitude_ apart in
severity. The diff image is the source of truth; the score is a
coarse index.

For a true "fraction of the subject that matches," author a
probe-friendly fixture (see the probe test section) and assert on
specific pixels, or mask the background to transparent so
`mask: alpha` counts only subject pixels. Plain refbrowser scores
cannot give you that signal.

**Per-fixture fields inside a suite entry** — all optional,
defaults shown; any field set on an entry overrides `defaults`.

```json
{
  "path": "../L0/<name>.html",
  "viewport": { "width": 600, "height": 800 },
  "wait_for": ["fonts", "networkidle"],
  "extra_css": [],
  "full_page": true
}
```

- `viewport` — Chromium viewport (px). Set height to match cg's cull
  height; mismatched dims score 0.0 at diff time (`@grida/reftest`
  requires identical dimensions).
- `wait_for` — `"fonts"` awaits `document.fonts.ready`, `"networkidle"`
  awaits 500ms of no-network-activity.
- `extra_css` — CSS files to inject into **both** sides. Paths resolve
  relative to the suite file. Playwright applies them via `addStyleTag`;
  cg applies them via `htmlcss::with_extra_stylesheets` before rendering,
  so the cascade is symmetric. Fields only meaningful to Chromium
  (`viewport`, `wait_for`, `full_page`) are ignored by cg.
- `full_page` — capture full scrollable area (default) vs. viewport.

**Pre-built helper stylesheets** under `fixtures/test-html/_reftest/`:

| File            | Effect                                                                                                                         |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `hide-text.css` | `color: transparent` + `line-height: 1`. Zeros glyph coverage and pins line-box height. Use when a fixture isn't testing text. |

Add more helpers here as divergence patterns emerge. Keep each one
scoped to a single concern (hide text, normalize scrollbars, force
web fonts, etc.) so suites can compose them.

**When to reach for `hide-text.css`** — any fixture whose subject is
paint, layout, box model, flex, grid, or positioning. The text in
those fixtures is typically decorative labels; its glyph rendering
and `line-height: normal` metrics diverge between Blink and Skia and
will dominate the diff otherwise.

**When NOT to use it** — fixtures whose subject IS text:
`text-decoration`, `text-shadow`, `text-align`, bidi, `writing-mode`,
font features. For these, leave `extra_css` empty and accept a
below-100 score; the reftest's value there is human review of the
diff image, not the numeric score.

**Authoring workflow** for a new fixture:

1. Write the `.html` fixture under `fixtures/test-html/L0/`.
2. Add an entry to `suites/L0.coverage.json` with at least
   `{ "path": "../L0/<name>.html" }`.
3. Render it once via `--suite L0.coverage.json` on the cg side; note
   the reported `WxH` in the log.
4. Set `viewport.height = H` on the entry; add `extra_css` helpers if
   relevant (e.g. `hide-text.css` for non-text fixtures). `defaults`
   in the suite likely already cover the common case.
5. Run the refbrowser producer + diff against the same suite. Review
   the diff PNG — if the diff is dominated by a known divergence zone
   (see below), record it in the PR description, don't suppress it.
6. If the fixture reaches 100.00% byte-exact, move its entry from
   `L0.coverage.json` to `L0.exact.json`.

**Known divergence surfaces** — areas where cg is not yet Blink-exact.
These are **backlog items, not tolerance excuses**. Do not tune
thresholds to suppress them. Document the specific divergence in the
PR description; let the score carry the truth.

- **Alpha compositing rounding** — `rgba()` backgrounds, `opacity`.
  cg and Blink choose different rounding rules (half-up vs banker's,
  premul vs straight, operand order), producing 1-unit channel
  deltas. Small-delta territory but still a real policy divergence.
- **Layout math under non-uniform padding / intrinsic sizing** —
  block widths resolving 1-3 px off when computed through flex
  children, asymmetric padding, or `width: auto` on transparent
  content. Shows up as diff brackets at box edges.
- **Text** — glyph rasterization (shaper version, subpixel positioning,
  hinting) and line-box metrics (`line-height: normal` ascent/descent)
  diverge. For non-text fixtures inject `hide-text.css`. For
  text-subject fixtures, accept a below-100 score and rely on the
  diff image for review.
- **Antialiasing on curves** — rounded corners, circles, ellipses,
  stroke ends. cg's path flattener emits different coverage values
  than Blink's for the same geometry.
- **Percentage border-radius** — `border-radius: 50%` and the `H / V`
  two-value form currently render as square in cg. Fixed-length radii
  (`12px`, `9999px`) work.
- **Gradients** — linear, radial, conic, repeating. Color-stop
  interpolation and color-space handling differ; banding and
  transition boundaries don't match.
- **Filters and shadows** — `filter: blur`, `backdrop-filter`,
  `box-shadow` with large blur radii. Kernel and sampling divergence
  dominates scores.
- **`<img>` fallbacks** — our `ImageProvider` renders a placeholder
  rect; Chromium renders broken-image chrome. Prefer fixtures with
  real image fills or none.
- **System-font fallback** — bundle fonts with `@font-face` + local
  paths when the fixture specifically tests font rendering.
- **Scrollbar width** — default `full_page: true` captures document
  height and sidesteps scrollbar chrome; flip only when testing
  scrollbar geometry.
- **Dimension drift** — changing a fixture's layout invalidates its
  `viewport.height` in the suite entry. Re-run `golden_htmlcss` with
  `--suite`, update the entry's `viewport.height`, re-run refbrowser.

**Oracle type summary:**

| Input format            | Oracle source            | Test type   |
| ----------------------- | ------------------------ | ----------- |
| SVG (W3C / resvg suite) | Co-located reference PNG | Reftest     |
| SVG (arbitrary, no PNG) | resvg-rendered PNG       | Reftest     |
| SVG (Grida extensions)  | Our own prior output     | Golden test |
| Figma REST / .fig       | Figma-exported PNG       | Reftest     |
| HTML / CSS (embed)      | Playwright Chromium PNG  | Reftest     |
| `.grida` native         | Our own prior output     | Golden test |

---

## Heuristic techniques (future work)

Two techniques that scale reftesting beyond "fixture in, score out."
Both are format-agnostic — they apply anywhere we control the oracle
pipeline (refbrowser, refsvg-via-resvg), and both are **unimplemented
today**. They're documented here so the design is shared before
anyone starts building.

### Subtree bisection — diff attribution

> Aliases: _diff attribution_, _culprit isolation_. Delta debugging
> applied to rendering.
>
> **TODO — tooling not ready.** Manual application only today.

A reftest gives you a single similarity score and a diff PNG. For a
minimal fixture that's enough — you eyeball the diff and the culprit
is obvious. As fixtures scale (multi-element compositions, nested
layout, overlapping subtrees), you know _that_ there's a divergence
but not _which_ element owns it.

**The technique** narrows "something in this fixture diverges" to
"this specific element's rendering is wrong," in two modes:

1. **Region → element (fast path).** Extract the bbox of high-delta
   regions from the diff PNG (connected-components or simple
   threshold pass). Match each bbox against element bounds in the
   fixture — confidently possible when elements are absolutely
   positioned or when the layout tree has dumped bounds available.
   One-shot lookup; names the culprit directly.

2. **Isolation bisection (slow path).** When region→element is
   ambiguous (overlapping elements, pure flow layout), generate
   temporary scoped-down fixtures by injecting override CSS that
   hides all siblings / cousins of a candidate subtree
   (`display: none` on the rest, or `visibility: hidden` if
   layout must be preserved). Re-run the reftest on each isolated
   view. Iterate through the element tree to produce per-subtree
   scores and converge on the offending node.

The two-path split matters because mode (1) is O(1) in reftest runs
and mode (2) is O(log n) at best — prefer (1) whenever bbox→element
is unambiguous.

**Applicability.**

| Reftest        | Oracle controllable? | Subtree bisection viable? |
| -------------- | -------------------- | ------------------------- |
| refbrowser     | Yes (Playwright)     | ✅ Yes                    |
| refsvg (resvg) | Yes (local CLI)      | ✅ Yes                    |
| W3C SVG suite  | No (pre-baked PNG)   | ❌ No                     |
| refig (Figma)  | No (manual export)   | ❌ No                     |

Figma is explicitly out: isolating a subtree would require
re-exporting from the Figma app, which is an upstream human step.

**Tooling shape (when built).** A script that:

1. Reads a reftest's diff PNG.
2. Extracts high-delta bounding boxes.
3. Attempts region→element match against a parsed fixture tree.
4. On ambiguity, writes override CSS for each candidate subtree,
   re-runs the producer + diff, accumulates per-subtree scores.
5. Outputs a JSON report keyed by element selector, with a score
   and a small preview diff per subtree.

Not unique to htmlcss — the same pattern works for any tree-structured
oracle with controllable input (SVG `<g>` subtrees, scene graph nodes
in .grida, etc.).

### Viewport sweep — width-matrix for layout fixtures

> Aliases: _width sweep_, _responsive sweep_, _width matrix_.
>
> **TODO — tooling not ready.** Single-width runs only today.

A single-viewport reftest catches a layout bug at that one width. It
misses bugs that only manifest at a different width — which for CSS
layout is most bugs (flex basis resolution, wrap points, grid
`auto-fill`, `min-content` / `max-content` interaction,
percentage-sized children against unusual parent widths).

**The technique.** Render the same layout fixture at a list of
viewport widths and diff each independently. A typical sweep:

```
widths: [320, 600, 768, 1024, 1280]  // mobile → desktop span
```

Produces N PNG pairs per fixture and N similarity scores. A fixture
passes only if _every_ width passes.

**Why width, not height.** CSS content flows vertically as a function
of the containing block's width; height is mostly an output, not an
input. Width variance exercises most layout regimes. Height variance
is relevant only for `min-height`/`max-height`/vh-based cases, which
are narrower and better covered by dedicated single-width fixtures.

**Applicability.** Layout-category fixtures only. Paint fixtures
(color, opacity, shadow, gradient, border-radius) render a fixed-size
subject inside a fixed canvas — sweeping widths adds no signal and
just multiplies work.

**Tooling shape (when built).** Suite schema grows a `widths` array
on layout entries:

```json
{
  "path": "../L0/box-dimensions.html",
  "widths": [320, 600, 1024]
}
```

Producers loop over `widths`, emitting PNGs named
`<stem>@<width>.png`. `@grida/reftest` treats each as a separate
test. No per-width `viewport.height` — let each width produce its
natural cull height (the measurement _is_ the output).

This technique is also format-agnostic — responsive SVG, responsive
refbrowser, and responsive .grida scenes all benefit from the same
width-sweep harness.

---

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

### Probe tests — vision-free verification

Use when correctness reduces to **"is pixel at (x,y) the expected
color?"** — layout, transforms, clipping, visibility. Requires
purpose-built fixtures (see "Observation-Based Probe Testing" below).

### Hybrid strategy

Priority: data test > reftest > probe test > golden test.

Assert on data when possible, use reftests for spec-backed formats, add
probe tests for coordinate-math behaviors, fall back to goldens for the rest.

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

## Observation-Based Probe Testing

Many rendering behaviors (layout, transforms, paint, clipping) can be
verified by **reading pixel values at known coordinates** instead of
diffing entire images. This avoids vision input entirely — a probe test
is just a boolean: "is pixel (x,y) the expected color?"

This works when the fixture is **purpose-built**: minimal palette,
no decorative noise, shapes at round coordinates. It breaks down when
the fixture is complex, uses gradients/filters/text, or wasn't authored
with probing in mind.

### Design rules

1. **≤ 3 solid colors.** e.g. black shape, white background, red marker.
2. **No labels, gridlines, or gradients** unless that's the behavior under test.
3. **Round coordinates.** Document expected probe points in the fixture.
4. **Probe interior pixels** (not edges) to avoid AA ambiguity.
5. **One concept per fixture.** Don't mix translate + rotate.

### Trust boundary

- **Reliable:** purpose-built probe fixtures with ≤ 4 solid colors.
- **Unreliable:** existing L0 fixtures (too many colors, labels, overlapping
  shapes), anything with gradients/filters/text. Don't retroactively probe
  fixtures not designed for it.

### Conventions

- **Path:** `fixtures/test-svg/probe/<behavior>-probe.svg`
- **Probe metadata:** XML comment in the SVG:

```xml
<!-- probe: (150,150)=#ff0000 (50,50)=#ffffff -->
```

- **Machine-readable (optional):** `.probe.json` alongside the SVG:

```json
{
  "surface": [300, 300],
  "probes": [
    {
      "x": 150,
      "y": 150,
      "expected": "#ff0000",
      "label": "translated square center"
    },
    { "x": 50, "y": 50, "expected": "#ffffff", "label": "origin now empty" }
  ]
}
```

### Future tooling

- **Color census:** count distinct colors (AA-clustered) to validate fixture simplicity.
- **Probe harness:** assert `.probe.json` points against rendered PNG (channel-wise ±3 tolerance).

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
| Assertion on scene graph / computed values  | data test, unit test                        | reftest, golden test       |
| Comparison against W3C/spec reference PNG   | reftest, reference test                     | snapshot test              |
| Comparison against our own prior output     | golden test, regression test, snapshot test | reftest                    |
| Two internal paths compared for equivalence | equivalence test, pixel-comparison test     | reftest                    |
| Pixel value asserted at known coordinates   | probe test, observation test                | reftest, golden test       |
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
| Probing complex multi-color fixtures                           | AA/gradients/overlaps produce unpredictable pixels.                                                     | Only probe purpose-built fixtures (≤4 solid colors, documented points).                                        |
| Retroactively probing L0 fixtures                              | Not designed for it; results untrustworthy.                                                             | Author new fixtures in `fixtures/test-svg/probe/`.                                                             |
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

### True reftest — Figma refig against Figma-exported oracle

```bash
# Pre-requisite: FIGMA_TOKEN / X_FIGMA_TOKEN in env, .env not auto-loaded.
# Assumes nodes in the Figma file already have exportSettings configured.

# 1. Archive + download oracle PNGs (one-time per suite)
python .agents/skills/io-figma/scripts/figma_archive.py \
  --filekey <KEY> \
  --archive-dir fixtures/local/refig/<name>.<KEY> \
  --export

# 2. Render per-node actuals with @grida/io-figma
#    (harness TBD — see fixtures/local/refig/README.md and
#    docs/wg/feat-fig/refig-testing.md if/when it exists)
npx tsx packages/grida-canvas-io-figma/refig-render.ts \
  fixtures/local/refig/<name>.<KEY> \
  -o target/refig/<name>/renders

# 3. Diff actuals against Figma oracle, write bucketed report
pnpm --filter @grida/reftest exec reftest \
  --actual-dir   target/refig/<name>/renders \
  --expected-dir fixtures/local/refig/<name>.<KEY>/exports \
  --output-dir   target/reftests/<name> \
  --bg white --mask alpha

# Result: target/reftests/<name>/report.json + S99/S95/S90/S75/err/ buckets.
# A score < 1.0 means our Figma import/render diverges from Figma itself.
# This is a genuine reftest — Figma's exported PNG is the oracle.
```

In a PR: _"refig(refig-standard): auto-layout row spacing fix, average
similarity 0.81 → 0.94, 612 tests S75→S95."_

### True reftest — HTML/CSS refbrowser against Playwright Chromium

```bash
# Pre-requisite: Chromium installed for Playwright
pnpm --filter @grida/reftest exec playwright install chromium

# 1. Render expecteds via Playwright Chromium
pnpm --filter @grida/reftest exec tsx .agents/skills/cg-reftest/scripts/refbrowser_render.ts \
  --suite   fixtures/test-html/suites/L0.exact.json \
  --out-dir target/refbrowser/expected

# 2. Render actuals via our cg pipeline
cargo run -p cg --example golden_htmlcss -- \
  --suite fixtures/test-html/suites/L0.exact.json
mkdir -p target/refbrowser/actual
cp "${TMPDIR:-/tmp}/grida-htmlcss-goldens/"*.png target/refbrowser/actual/

# 3. Diff actuals against Chromium oracle, write bucketed report
pnpm --filter @grida/reftest exec reftest \
  --actual-dir   target/refbrowser/actual \
  --expected-dir target/refbrowser/expected \
  --output-dir   target/reftests/htmlcss \
  --bg white

# Result: target/reftests/htmlcss/report.json + S99/S95/S90/S75/err/ buckets.
# A score < 1.0 means our htmlcss renderer diverges from Chromium.
# This is a genuine reftest — Playwright Chromium is the oracle.
```

In a PR: _"refbrowser(htmlcss): background-repeat space/round landed,
average similarity 0.72 → 0.91 across 6 repeat fixtures."_

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

### Probe test — transform verification without vision

```xml
<!-- fixtures/test-svg/probe/translate-probe.svg -->
<!-- probe: (150,150)=#ff0000 (50,50)=#ffffff -->
<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300">
  <rect width="300" height="300" fill="#ffffff"/>
  <g transform="translate(100, 100)">
    <rect width="100" height="100" fill="#ff0000"/>
  </g>
</svg>
```

```rust
let img = render_svg("fixtures/test-svg/probe/translate-probe.svg", 300, 300);
assert_eq!(img.pixel_at(150, 150), Color::RED);   // translated center
assert_eq!(img.pixel_at(50, 50), Color::WHITE);    // origin now empty
```

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

- [ ] **Correct category.** Is this a data test, reftest, probe test, golden test, or equivalence test? Labeled correctly?
- [ ] **Render necessary?** Could this be a data test instead? If the assertion is on layout/transform/style values, skip rendering.
- [ ] **Minimal fixture.** Does the test use the simplest scene that exercises the behavior?
- [ ] **One behavior.** Does each test verify a single rendering behavior?
- [ ] **Deterministic.** Are fonts bundled? Is the surface size explicit? Is there a fixed seed for procedural content?
- [ ] **Threshold justified.** If tolerance is non-zero, is there a comment explaining why?
- [ ] **Golden diff reviewed.** If golden images changed, has each change been visually inspected and explained?
- [ ] **No bulk golden regeneration.** Were goldens updated individually with stated reasons?
- [ ] **Probe feasibility.** For layout/transform/clip — could this be a probe test instead of a golden?
- [ ] **Probe fixture valid.** If probe test: ≤4 colors, points inside boundaries (not AA edges), probe metadata present.
- [ ] **Edge cases.** Are zero-size, empty, and degenerate inputs tested?
- [ ] **Environment documented.** If goldens are platform-sensitive, is the generation environment stated?
- [ ] **Honest wording.** Does the PR title/description use correct terminology?
