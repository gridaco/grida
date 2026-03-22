---
name: cg-perf
description: Guides performance optimization work on the Grida Canvas Rust rendering engine (cg crate). Use when asked to benchmark, profile, optimize, or analyze rendering performance — panning, zooming, compositing, caching, culling, or frame budgeting.
---

# Grida Canvas Engine — Performance Development

Workflow and reasoning framework for render performance work on the
Grida Canvas Rust engine.

## When to Use This Skill

- Benchmarking canvas rendering
- Optimizing frame time for any camera operation
- Designing or modifying caching strategies
- Analyzing benchmark results
- Writing or auditing benchmarks
- Investigating performance regressions

---

## How to Orient Yourself

Before touching any code, build context by reading these sources in order:

1. **Read `crates/grida-canvas/AGENTS.md`** — crate conventions, test/check
   commands, benchmarking instructions.
2. **Read `docs/wg/feat-2d/optimization.md`** — the master optimization
   document. It describes every optimization strategy, measured costs, and
   the rendering pipeline. This is the single most important file.
3. **Browse `docs/wg/research/chromium/`** — research notes on how Chromium
   solves equivalent problems. Start with `index.md` for the map, then
   read whichever documents match the problem at hand.
4. **Read existing benchmarks** — look in `crates/grida-canvas/benches/`
   to understand what is already measured and how.
5. **Read `crates/grida-dev/src/main.rs`** — the `bench` and `bench-report`
   subcommands show how GPU benchmarks work with real `.grida` scene files.
   `bench-report` is the bulk mode that outputs JSON across all fixtures.

Use `grep` and `glob` to discover the current state of code rather than
relying on hardcoded paths. File locations shift as the engine evolves.

### Key discovery queries

| What you need                             | How to find it                                                                                      |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------- |
| The renderer entry point                  | `grep "struct Renderer" --include="*.rs"` in `crates/grida-canvas/src/`                             |
| Camera change classification              | `grep "enum CameraChangeKind" --include="*.rs"`                                                     |
| How compositor cache works                | `grep "struct LayerImage" --include="*.rs"` and read the containing module                          |
| Promotion heuristics                      | `grep "fn should_promote" --include="*.rs"`                                                         |
| Where zoom invalidation happens           | `grep "zoom_changed\|mark_all_stale\|invalidate_all" --include="*.rs"` in `src/runtime/`            |
| Frame pipeline flow                       | Search for `fn queue\|fn flush\|fn draw\|fn frame` in the renderer file                             |
| Benchmark fixture scenes                  | `--list-scenes` flag on `grida-dev bench`, or run `bench-report` on a directory                     |
| Config toggles (compositing, atlas, etc.) | `grep "set_layer_compositing\|set_compositor_atlas\|set_interaction_render_scale" --include="*.rs"` |
| Existing `.plan.md` proposals             | `glob "docs/wg/feat-2d/*.plan.md"`                                                                  |

---

## The Benchmark Systems

There are three complementary benchmarks. The bulk report is the
recommended starting point; the single-scene bench and Criterion
provide deeper investigation when needed.

### 1. Bulk benchmark report (`grida-dev bench-report`)

Runs all scenes in all `.grida` files and outputs a compact **JSON
report**. Use this to establish baselines, detect regressions across
the full fixture set, and identify which scenes/stages are slowest.

```sh
# All fixtures — recommended first step
cargo run -p grida-dev --release -- bench-report ./fixtures/ --frames 100 --output baseline.json

# Single file
cargo run -p grida-dev --release -- bench-report ./fixtures/test-grida/bench.grida --frames 200

# Local fixtures for broader coverage
cargo run -p grida-dev --release -- bench-report ./fixtures/local/ --frames 100 --output baseline-local.json
```

The JSON report contains per-scene results with:

- `nodes`, `effects_nodes` — scene complexity
- `pan.{avg_us, fps, p50_us, p95_us, p99_us}` — pan performance
- `pan.{draw_us, mid_flush_us, compositor_us, flush_us}` — per-stage breakdown
- `zoom.{avg_us, fps, p50_us, p95_us, p99_us}` — zoom performance
- `errors[]` — files that failed to load

Progress goes to stderr, JSON to stdout (or `--output path`). This
keeps the JSON clean for programmatic consumption.

### 2. Single-scene GPU benchmark (`grida-dev bench`)

Runs real scene data on the actual GPU backend (Metal/GL). This is the
ground truth for "does the user experience improve?"

```sh
# List scenes to pick the right one
cargo run -p grida-dev --release -- bench ./fixtures/test-grida/bench.grida --list-scenes

# Run a specific scene
cargo run -p grida-dev --release -- bench ./fixtures/test-grida/bench.grida --scene <N> --frames 200
```

**Always use `--release`.** Debug builds are 20-30x slower and produce
meaningless data.

The output reports pan and zoom separately with avg/p50/p95/p99 and a
per-stage breakdown. Read the breakdown to understand WHERE time is
spent (draw vs compositor vs GPU flush), not just the total.

**Choosing scenes:** Use `--list-scenes` to see what's available. Pick
scenes that stress the subsystem you're optimizing. For effects/caching
work, look for scenes with high promoted-node counts. For culling work,
look for scenes with many visible nodes but few effects.

### 2. Criterion benchmark (`bench_camera`)

Runs synthetic scenes on a raster (CPU) backend. This isolates
algorithmic costs from GPU behavior and produces statistically rigorous
results with confidence intervals.

```sh
# Run all
cargo bench -p cg --bench bench_camera

# Filter by scene, config, or operation (use substring matching)
cargo bench -p cg --bench bench_camera -- heavy_compositing/zoom
```

Read the benchmark file's header comments to understand the full matrix
of scenes, configs, and operations. The naming convention is
`{scene}_{config}/{operation}`.

### When to use which

| Question                                      | Use                              |
| --------------------------------------------- | -------------------------------- |
| What's slow across all fixtures?              | Bulk report (`bench-report`)     |
| Baseline before/after a change?               | Bulk report (save JSON, compare) |
| Detailed investigation of one scene?          | Single-scene GPU bench           |
| Is the algorithm itself faster?               | Criterion                        |
| Is there a statistical regression?            | Criterion (has CI)               |
| What's the real frame time with GPU overhead? | Single-scene GPU bench           |
| Does a config toggle actually help?           | Both GPU benchmarks + Criterion  |

---

## The Verification Workflow

**Every performance change follows this sequence. No exceptions.**

### Step 1: Baseline

Run the bulk benchmark report BEFORE any changes. Save the JSON output
so you can compare against it after the change.

```sh
cargo run -p grida-dev --release -- bench-report ./fixtures/ --frames 100 --output baseline.json
```

For algorithmic changes, also run Criterion to get statistical baselines.

### Step 2: Implement

Make the change. After each logical step, verify:

```sh
cargo check -p cg --all-targets
cargo clippy -p cg --no-deps --all-targets --all-features
cargo test -p cg
```

### Step 3: Measure

Run the same benchmarks AFTER the change. Compare the numbers.

### Step 4: Regression check

Re-run the bulk benchmark report and compare against `baseline.json`.

```sh
cargo run -p grida-dev --release -- bench-report ./fixtures/ --frames 100 --output after.json
```

A zoom optimization must not regress pan. An effects optimization must
not regress non-effects scenes. The bulk report covers all scenes
automatically — compare the full set, not just the target.

### Step 5: Accept or iterate

| Criterion                                   | Required? |
| ------------------------------------------- | --------- |
| Target operation meets the fps goal         | Yes       |
| Non-target operations within 5% of baseline | Yes       |
| All `cargo test -p cg` tests pass           | Yes       |
| No new clippy warnings from changed files   | Yes       |

---

## How to Design an Optimization

### 1. Measure first

Run benchmarks to quantify the problem with numbers. If you can't
measure it, you can't optimize it, and you can't verify the fix.
Identify which stage of the pipeline is the bottleneck (read the
per-stage breakdown from GPU bench).

### 2. Study Chromium's approach

Read the relevant documents in `docs/wg/research/chromium/`. Chromium
has solved most rendering performance problems at massive scale. The
research notes are organized by topic — use `index.md` as the map.

### 3. Adapt for our constraints

Our engine differs from Chromium in specific ways that affect which
strategies are feasible:

- **Single thread** — WASM cannot do shared-memory GPU threading.
  Substitute parallelism with **time budgets** (cap per-frame work).
- **Per-node cache** — We cache individual nodes, not spatial tiles.
  This gives us finer control over what to re-rasterize and when.
- **Infinite canvas** — No page boundaries. Viewport culling is the
  primary mechanism for limiting work.
- **Less dynamic content** — No CSS reflow on zoom. The scene graph is
  stable across frames. Leverage this for aggressive caching.

When adapting a Chromium strategy, always document what you borrowed,
what you changed, and why.

### 4. Write a proposal

Create a `.plan.md` file in `docs/wg/feat-2d/` containing:

- **The problem** — benchmark numbers showing the current cost.
- **Chromium's approach** — what the reference architecture does.
- **Our adaptation** — what we'll do differently and why.
- **Expected performance** — target numbers for each affected scenario.
- **Implementation steps** — ordered so each step is independently
  verifiable.
- **Validation commands** — exact benchmark commands and target metrics.

### 5. Implement incrementally

Each step should compile, pass tests, and produce a measurable
improvement. Run benchmarks after each step. If a step regresses a
non-target scenario, fix it before moving on.

### 6. Review for correctness

Performance bugs are worse than performance problems — a cache that
returns wrong data at high speed produces wrong frames silently.

For every cache/skip optimization, trace through:

- What state transitions mark entries invalid?
- Can an entry be returned when it shouldn't be?
- What happens at edge cases? (zero values, NaN, overflow, empty scenes)
- Is the invalidation flag cleared after re-rasterization?
- Does the multi-frame lifecycle converge to full quality?

---

## How to Write and Audit Benchmarks

### Writing rules

1. **One conceptual operation per `b.iter()`.** If a benchmark measures
   multiple frames per sample, document it in a comment.

2. **Bounded oscillation.** Camera state must not drift across
   iterations. Use alternating patterns (`dx = -dx`) or two-level
   alternation. Unbounded drift causes the camera to leave the scene,
   measuring empty frames.

3. **Setup outside `b.iter()`.** Scene creation, renderer init, and
   warm-up frames go before the measured closure.

4. **`black_box()` on results.** Wrap `flush()` return values to prevent
   the compiler from optimizing away the work.

5. **Verify camera classification.** Trace through the camera API to
   confirm each scenario triggers the intended `CameraChangeKind`. Read
   how `before_change()` and `change_kind()` interact.

### Auditing checklist

Before trusting any benchmark result, verify:

- [ ] Setup cost is excluded from measurement
- [ ] No iterations produce no-ops (check for quantization skips)
- [ ] State does not accumulate/drift (check translation, zoom bounds)
- [ ] Config profiles take effect (check setter order vs scene loading)
- [ ] Multi-frame benchmarks document frames-per-sample
- [ ] The benchmark scenario actually exercises the codepath under test

---

## How to Read Optimization Docs

`docs/wg/feat-2d/optimization.md` is numbered by item. When the
codebase references "item 6b" or "item 17", it means that numbered
section. Read it as a living catalog — items are added as new strategies
are designed.

The document is organized by category:

- Transform & Geometry (items 1-3)
- Rendering Pipeline (items 4-14)
- Pan-Only Optimization (items 15-20)
- Zoom Asymmetry (items 21-23)
- Zoom & Interaction Optimization (items 24-30)
- Image, Text, Engine-Level (items 31-39)

When working on a new optimization, check whether an item already
exists for it, and update or add to the document as part of the work.

---

## Pitfalls

These are failure modes learned from experience. Each one has caused
real bugs or wasted time.

### GPU and raster backends behave differently

An optimization that helps on GPU may hurt on raster, and vice versa.
Compositor caching and atlas packing are GPU-only wins — on raster they
add pure overhead. Always run both benchmark systems.

### Global invalidation is a performance cliff

Any operation that touches all cache entries on a hot path (e.g. every
frame during a gesture) will produce catastrophic frame times at scale.
The pattern to avoid: "on X change, invalidate everything." The pattern
to use: "on X change, mark stale, re-rasterize within budget."

### Skia's `save_layer` has fixed overhead

It allocates an offscreen GPU texture regardless of content size. This
is a ~57us fixed cost per call. At node scale (hundreds/thousands),
it dominates frame time. Check `optimization.md` for when it can be
avoided and when it can't.

### Benchmark oscillation drift

A benchmark whose camera drifts off-scene over iterations measures
empty frames — useless data that looks deceptively fast. Pinch-zoom
(`set_zoom_at`) is especially prone because each call shifts translation.
Use two-level alternation (A/B zoom values) so translations cancel.

### Criterion measures raster, not GPU

Criterion runs on a CPU raster backend. It's excellent for measuring
algorithmic cost and detecting regressions in pipeline logic. But it
tells you nothing about GPU texture switching, GPU flush latency, or
Metal/GL driver behavior. Don't conclude "compositing doesn't help"
from Criterion results — it doesn't help on _raster_, which is expected.

### Timing overhead in budgeted loops

`Instant::now()` costs ~30ns per call. In a tight loop processing
thousands of cheap entries, the timing checks themselves can become
significant. Use `elapsed()` checks at reasonable intervals, not every
iteration.
