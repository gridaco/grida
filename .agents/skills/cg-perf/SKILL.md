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
| Scene loading pipeline                    | `grep "fn load_scene" --include="*.rs"` in `src/runtime/scene.rs`                                   |
| Layout engine entry point                 | `grep "fn compute\b" --include="*.rs"` in `src/layout/engine.rs`                                    |
| Text measurement stats                    | `grep "ParagraphMeasureStats" --include="*.rs"`                                                     |
| Skip-layout config                        | `grep "skip_layout" --include="*.rs"` in `src/runtime/`                                             |
| Load-bench CLI tool                       | Read `crates/grida-dev/src/bench/load_bench.rs`                                                     |

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
- `fit_zoom` — the zoom level from `fit_camera_to_scene`
- `pan` / `zoom` — legacy passes with full `PassStats`
- `scenarios[]` — expanded scenario matrix (see below)
- `errors[]` — files that failed to load

Each `PassStats` contains:

- `avg_us`, `fps`, `min_us`, `p50_us`, `p95_us`, `p99_us`, `max_us` — latency distribution
- `queue_us`, `draw_us`, `mid_flush_us`, `compositor_us`, `flush_us` — per-stage breakdown
- `settle_us` — cost of the stable (settle) frame after the pass ends

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

The output reports legacy pan/zoom, then an expanded scenario matrix
covering 20+ scenarios across multiple gesture types. Each scenario
reports `min/p50/p95/p99/MAX` plus per-stage breakdown and settle cost.

**Scenario types in the expanded matrix:**

| Kind              | Scenarios                                           | What it tests                                                                                                      |
| ----------------- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `pan`             | slow/fast × fit/zoomed                              | Linear back-and-forth panning                                                                                      |
| `circle_pan`      | small/large radius × fit/zoomed                     | Circular trackpad gesture (unpredictable edges)                                                                    |
| `zigzag`          | fast (continuous) / slow (with pauses) × fit/zoomed | Diagonal reading pattern with direction changes                                                                    |
| `zoom`            | slow/fast × around-fit/high                         | Zoom oscillation at different levels                                                                               |
| `pan_with_settle` | slow/fast × fit/zoomed                              | Pan with settle frames interleaved every 12 frames                                                                 |
| `realtime`        | fast/slow × fit/zoomed                              | **Real-time event loop simulation** with sleep, 240Hz tick thread, and settle countdown matching the native viewer |
| `frameloop`       | 16/50/80/120/200/300/500ms interval                 | **Real FrameLoop path** — the only bench that captures stable-frame jank during panning (see below)                |
| `resize`          | alternating viewport sizes                          | `--resize` flag. Measures `resize()` + `redraw()` cost per cycle (layout rebuild + cache invalidation + repaint)   |

The `realtime` scenarios use actual `thread::sleep()` between frames
and simulate the native viewer's 240Hz tick thread + settle countdown.
These produce frame timings that match what users actually see,
including settle-induced frame drops at their natural frequency.

The `frameloop` scenarios go through the actual `FrameLoop.poll()` /
`complete()` path — the same code path as `Application::frame()`. All
other pan/zoom scenarios bypass `FrameLoop` and call `queue_unstable()`
directly, which means they never produce stable frames mid-interaction.
The `frameloop` scenarios sweep scroll intervals from 16ms (fast flick)
to 500ms (discrete clicks) and reveal how `FrameLoop`'s stable-frame
decisions affect the frame time distribution at each speed. Use these
when investigating panning jank, adaptive timing, or pan/zoom image
cache behavior.

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

| Question                                      | Use                                              |
| --------------------------------------------- | ------------------------------------------------ |
| What's slow across all fixtures?              | Bulk report (`bench-report`)                     |
| Baseline before/after a change?               | Bulk report (save JSON, compare)                 |
| Detailed investigation of one scene?          | Single-scene GPU bench                           |
| Is the algorithm itself faster?               | Criterion                                        |
| Is there a statistical regression?            | Criterion (has CI)                               |
| What's the real frame time with GPU overhead? | Single-scene GPU bench                           |
| Does a config toggle actually help?           | Both GPU benchmarks + Criterion                  |
| Does it match what users see in the app?      | `realtime` scenarios (sleep + settle simulation) |
| Are there frame drops during gestures?        | Check `p99` and `MAX` in scenario stats          |
| Is slow panning janky (stable frame spikes)?  | `frameloop` scenarios (real FrameLoop path)      |
| Is resize janky?                              | Single-scene GPU bench with `--resize`           |

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

2. **Continuous panning with reversal.** Pan benchmarks should use
   continuous motion (one direction for half the frames, then reverse)
   to trigger cache misses and new-area discovery. The old alternating
   `±dx` pattern only measured cache hits. For zoom, use bounded
   oscillation with direction reversal at limits.

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
- Image, Text (items 31-33)
- Scene Loading & Layout (items 40-44)
- Engine-Level (items 34-39)

When working on a new optimization, check whether an item already
exists for it, and update or add to the document as part of the work.

---

## Scene Loading & Layout Performance

Scene loading (`Renderer::load_scene`) is the cold-start bottleneck.
For large documents (100K–150K+ nodes), the layout phase dominates
load time. This is separate from frame rendering — it runs once per
scene switch, not per frame.

### Key files

| File                                                      | Role                                       |
| --------------------------------------------------------- | ------------------------------------------ |
| `crates/grida-canvas/src/runtime/scene.rs` (`load_scene`) | Orchestrates the load pipeline             |
| `crates/grida-canvas/src/layout/engine.rs`                | Layout engine (Taffy tree build + compute) |
| `crates/grida-canvas/src/runtime/config.rs`               | `skip_layout` flag                         |
| `crates/grida-dev/src/bench/load_bench.rs`                | `load-bench` CLI for per-stage timing      |
| `crates/grida-canvas/benches/bench_load_scene.rs`         | Criterion benchmarks for layout at scale   |

### The load-bench tool

Primary diagnostic for scene loading. Reports per-stage timings.

```sh
cargo run -p grida-dev --release -- load-bench file.grida --iterations 5
cargo run -p grida-dev --release -- load-bench file.grida --list-scenes
cargo run -p grida-dev --release -- load-bench file.grida --skip-text    # isolate tree + flexbox cost
cargo run -p grida-dev --release -- load-bench file.grida --skip-layout  # schema-only fast path
```

### Cost breakdown

For 100K–150K node scenes, layout is ~95%+ of `load_scene`. The main
cost centers:

1. **Taffy tree construction** — node insertion + ID mappings
2. **Text measurement** — Skia paragraph layout calls per Taffy measure callback
3. **Flexbox computation** — `compute_layout_with_measure()` per subtree
4. **Layout extraction** — DFS walk to read computed results

### Key optimization: skip_layout

`skip_layout` bypasses Taffy entirely. `compute_schema_only()` copies
schema positions/sizes in a single walk — correct for absolute-positioned
documents. Set via `runtime_renderer_set_skip_layout(true)` before
loading a scene.

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

### Benchmark vs native viewer mismatch

Back-to-back frame benchmarks (no sleep between frames) can produce
misleadingly fast numbers because they never trigger settle frames.
The native viewer's 240Hz tick thread fires `queue_stable()` ~50ms
after the last interaction, clearing image caches. Use the `realtime`
or `frameloop` scenario types to produce numbers that match what users
actually see. Always check `p99` and `MAX` — not just `p50` — to
catch settle-induced spikes.

### Most benchmarks bypass FrameLoop

All pan/zoom/circle/zigzag scenarios call `queue_unstable()` directly
— they never go through `FrameLoop.poll()`. This means they never
produce stable frames mid-interaction and cannot capture the jank
pattern where a stable frame interrupts slow panning. Only the
`frameloop` scenarios use the real `FrameLoop` decision path. When
investigating panning smoothness or adaptive timing, always use the
`frameloop` scenarios.

### Stable frames must recapture caches

When `queue_stable()` fires, it clears the pan/zoom image caches so
the stable frame renders at full quality. The stable frame's full
draw **must recapture** the caches afterwards, so the next unstable
frame gets a cache hit. Without recapture, every frame after settle
is also a full draw, producing 7fps instead of 100+fps. The capture
guard should be `if self.backend.is_gpu()` — NOT `if !plan.stable`.

### Layout is the cold-start bottleneck, not rendering

For large documents (100K+ nodes), `load_scene` dominates cold start
— frame rendering optimizations do not help here. Use `load-bench`
(not `bench`) to measure this path. Use `skip_layout` for
absolute-positioned documents.

### Timing overhead in budgeted loops

`Instant::now()` costs ~30ns per call. In a tight loop processing
thousands of cheap entries, the timing checks themselves can become
significant. Use `elapsed()` checks at reasonable intervals, not every
iteration.
