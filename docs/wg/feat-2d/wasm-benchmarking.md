---
title: "WASM Benchmarking Strategy"
format: md
tags:
  - internal
  - wg
  - canvas
  - performance
  - wasm
  - benchmarking
---

# WASM Benchmarking Strategy

## Why Real WASM Benchmarking Matters

When evaluating performance for a system that ships as WebAssembly, it is not
enough to benchmark only the native implementation. Native benchmarks are still
valuable, but they do not fully represent the runtime characteristics of WASM.

WebAssembly introduces a different execution environment, different code
generation, different memory behavior, and often a different host integration
model. As a result, performance measured in native Rust cannot be assumed to
transfer directly to WASM. Even when the core algorithm is identical, the
compiled output and runtime constraints are not.

Real WASM benchmarking is necessary whenever performance decisions are intended
to reflect the actual delivered runtime.

## Why Native-Only Benchmarking Is Not Sufficient

Native benchmarks are useful for understanding the upper bound of performance
and for comparing algorithmic choices in an idealized environment. They are
especially helpful for isolating pure compute costs and for detecting
regressions in the Rust implementation itself.

However, native benchmarks do not capture several important WASM-specific
effects:

- Code generation differences between native and WASM targets
- Linear memory behavior in WASM
- JS-WASM boundary costs
- Host runtime differences (V8/SpiderMonkey vs native CPU)
- Constraints specific to the WASM execution model (no SIMD by default,
  limited stack, single-threaded)

A native benchmark may correctly show that one version is faster than another,
while still failing to predict the actual magnitude of the improvement in WASM.

## WASM-on-Node: Real WASM Without the Browser

Although browser execution is the final target, benchmarking WASM does not
strictly require a browser in all cases.

A WASM module can also run in Node.js. For compute-heavy workloads, this
provides a practical way to measure real WASM execution without introducing
browser automation, rendering setup, or UI-related noise.

WASM-on-Node still measures:

- The WASM target itself (same compiled `.wasm` binary)
- WASM code generation (same emscripten output)
- WASM memory behavior (same linear memory model)
- Much of the same runtime structure as deployed WASM (V8 WASM engine)

It is not a native proxy pretending to be WASM. It is real WASM, just hosted
outside the browser.

### What WASM-on-Node Is Good For

WASM-on-Node is a strong option for benchmarks that are mostly internal to the
engine and do not depend heavily on browser APIs:

- Scene loading and construction
- Layout computation
- Geometry processing
- Effect tree building
- Layer flattening and sorting
- Serialization and deserialization (FlatBuffers decode)
- Hit testing
- Pure compute kernels

For these categories, WASM-on-Node provides meaningful performance
measurements and regression tracking. It is especially useful in CI, where
running a browser-based benchmark suite is heavier, more fragile, and harder
to keep deterministic.

### What WASM-on-Node Cannot Fully Represent

The browser environment adds behaviors and constraints that Node does not
reproduce exactly:

- Browser event loop behavior and frame timing
- Worker scheduling characteristics
- Rendering pipeline costs (GPU flush, surface snapshot)
- DOM or canvas interaction
- Browser-specific memory pressure and GC behavior
- Browser-specific host API overhead

WASM-on-Node should not be treated as a complete substitute for browser
benchmarking when the workload depends on browser integration.

## Three-Layer Benchmarking Model

A practical approach treats benchmarking as three separate layers:

### Layer 1: Native benchmark

Measures the implementation ceiling and isolates core algorithmic cost.

Tools: `cargo run -p grida-dev --release -- load-bench`, Criterion benches
in `crates/grida-canvas/benches/`.

Best for: Algorithmic comparisons, regression detection, profiling with
native tools (perf, Instruments, samply).

### Layer 2: WASM-on-Node benchmark

Measures real WASM execution in a simple, repeatable, automation-friendly
environment.

Tools: Node.js script that loads the emscripten `.js` + `.wasm` module,
calls C-ABI functions, measures with `performance.now()`.

Best for: Regression tracking, validating whether an optimization helps in
the WASM target, CI integration, comparing WASM/native ratios.

### Layer 3: Browser benchmark

The final reference for workloads that depend on browser-specific behavior
or APIs.

Tools: Debug page at `/embed/v1/debug` with console timing, manual
stopwatch for end-to-end, browser DevTools profiling.

Best for: Full pipeline validation (JS encode + WASM load + GPU render),
real-world user-facing latency measurement.

## What We Can Safely Learn From WASM-on-Node

WASM-on-Node is often very good for:

- Tracking regressions over time
- Comparing alternative implementations
- Measuring scaling trends (how cost grows with node count)
- Validating whether an optimization helps in the WASM target at all

Relative changes are more trustworthy than absolute numbers. If one
implementation is consistently 20% faster in WASM-on-Node, that is a
meaningful signal even if browser timings differ in absolute terms.

## Caveats

- Native Rust and WASM should not be assumed to have a fixed conversion
  ratio. A workload that is close to native speed in one case may diverge
  much more in another.
- WASM-on-Node and WASM-in-browser should not be assumed to be numerically
  identical. They may show the same trend while differing in total runtime.
- Benchmarks that frequently cross the JS boundary may behave very
  differently from benchmarks that remain almost entirely inside WASM.
- Any benchmark involving rendering, canvas, GPU, event loops, or browser
  worker coordination should still be validated in the browser.

## Lessons Learned (from load_scene optimization, 2026-03)

### The WASM/native ratio is not constant across operations

Different operations within the same codebase can have wildly different
WASM/native ratios. In the `load_scene` pipeline, we observed:

- Simple compute (font collection, effect tree): ~2-3x WASM overhead
- HashMap-heavy traversal: 8-35x WASM overhead
- After replacing HashMap with Vec-indexed storage: overhead dropped to
  1-2x for data-structure-dominated stages, but stayed 5-30x for
  compute-heavy stages

The ratio depends on the nature of the work, not just the volume. Assuming
a single multiplier (e.g. "WASM is 3x slower") leads to incorrect
predictions.

### Data structure choice matters far more in WASM than native

HashMap with 136k entries showed acceptable performance on native (hidden
by hardware prefetch, out-of-order execution, and large caches). The same
HashMap in WASM was catastrophically slow because WASM's linear memory
model, smaller effective caches, and more in-order execution expose every
cache miss.

The fix — replacing `HashMap<NodeId, V>` with `Vec<Option<V>>` indexed by
sequential `NodeId` — had a modest effect on native (~18% improvement) but
a dramatic effect on WASM, cutting some stages by 50% or more. This
confirms that data structure choices optimized for native may be poor
choices for WASM, and vice versa.

### `std::time::Instant` does not work in emscripten WASM

`Instant::now()` returns a constant value (effectively zero) under
emscripten. Any timing code that uses `Instant` will silently produce
meaningless results in WASM.

The solution is `emscripten_get_now()` (bound as a C extern), which maps
to `performance.now()` and provides millisecond-resolution timing. We
wrapped this in `sys::perf_now()` which dispatches to `emscripten_get_now`
on WASM and `Instant`-based timing on native, so the same instrumentation
code works on both targets.

### Native benchmarks can verify coverage but not WASM cost

Before instrumenting WASM, we first confirmed that the native load-bench
covered the same code path as the WASM `switch_scene` C-ABI call. This
was important: if the benchmark had been missing a stage, the WASM
measurement would have been unexplainable.

The native benchmark correctly identified all five stages (fonts, layout,
geometry, effects, layers) and their relative costs. What it could not
predict was which stages would blow up in WASM. The native profile showed
layers as the dominant cost (45%); in WASM, geometry was dominant (40%)
due to per-node HashMap amplification that native hardware masked.

### Per-stage timing inside WASM is essential

Without sub-stage timing, a 10-second WASM call is opaque. With
`emscripten_get_now()` instrumented around each stage, we immediately
identified that geometry and layout were the primary targets, not layers
(which native benchmarks had suggested).

The pattern of adding `perf_now()` calls around major phases and
`eprintln!` for output (which appears in the browser console via stderr)
is lightweight and should be the first step in any WASM performance
investigation.

### GPU-only code paths create WASM-specific bugs

Two rendering bugs were found that only manifested in WASM because native
uses a CPU backend:

1. `blit_content_cache()` drew a stale pan cache at (0,0) instead of the
   correct offset — invisible on CPU backend because `is_gpu()` returned
   false and the function short-circuited.
2. The overlay-only fast path intercepted stable frames, preventing
   full-quality re-rendering — again only triggered on GPU backend.

This reinforces that WASM testing is not just about performance. The GPU
backend (WebGL via emscripten) exercises code paths that native CPU
rendering never touches.

### The JS-WASM boundary overhead is small for bulk operations

For `load_scene`, the JS side contributes string allocation and a single
C-ABI call. The actual boundary cost (allocate string in WASM memory,
call `_switch_scene`, free string) is negligible compared to the work
inside WASM. For bulk operations, the boundary is not the bottleneck.

However, the JS-side FlatBuffers encoding (serializing the scene graph
into a binary buffer before passing to WASM) is a non-trivial cost —
roughly 10% of the total pipeline. This work happens entirely in JS and
is invisible to Rust-side benchmarks.

### Large enum access is pathologically slow in WASM

After eliminating all data structure overhead (HashMap → DenseNodeMap), the
geometry DFS still showed 33× WASM/native ratio. The remaining bottleneck is
the `Node` enum itself — 15 variants, each a large struct. Accessing
`graph.get_node(id)` fetches a reference into `Vec<Option<Node>>` where each
slot is the size of the largest variant (likely 500+ bytes).

For 136k nodes, the DFS touches ~65MB of node data, most of which is
irrelevant to geometry (paints, text content, vector networks). Native
hardware mitigates this with prefetching and out-of-order execution. WASM's
linear memory model and bounds-checked loads make this 30× slower.

The fix is a Struct-of-Arrays (SoA) approach: extract only the
geometry-relevant fields (transform, size, kind, ~48 bytes) into a compact
dense array, then run the DFS on that. This is documented in
`wasm-load-scene-optimization.md`.

### Optimization priorities differ between native and WASM

On native, the priority order for `load_scene` was:
layers > geometry > layout > fonts > effects.

On WASM, after the same optimizations, the priority order was:
geometry > layout > layers > fonts > effects.

An optimization strategy based purely on native profiling would have
targeted layers first. The actual highest-impact target in WASM was
geometry, due to HashMap amplification that native did not expose.

## Implementation Plan: WASM-on-Node Benchmark Harness

### Architecture

The WASM-on-Node benchmark harness reuses the same emscripten-compiled
`.js` + `.wasm` module that ships to the browser. It loads the module in
Node.js, calls the C-ABI functions directly, and measures with
`performance.now()`.

```
Node.js script
  |-- load grida-canvas-wasm.js (emscripten glue)
      |-- instantiate grida_canvas_wasm.wasm
          |-- call C-ABI: _create_app, _load_scene_grida, _switch_scene
              |-- measure each call with performance.now()
```

### Scope

The harness measures the `load_scene` pipeline — the same stages measured
by the native `load-bench`:

1. FBS decode (`_load_scene_grida`)
2. Scene switch / layout+geometry+effects+layers (`_switch_scene`)

GPU rendering is not available in Node (no WebGL context), so render-path
benchmarks are out of scope for this layer.

### Key Differences from Browser

- No GPU backend — the WASM module should be configured with a stub or
  CPU-only backend for benchmarking load_scene (which does not render)
- No RAF loop — calls are synchronous
- No JS editor state — only the WASM module is exercised

### Internal Timing

The WASM module emits per-stage timing via `eprintln!` using
`sys::perf_now()` (which calls `emscripten_get_now()`). The Node harness
captures stderr and parses the `[load_scene]` line to extract per-stage
breakdowns without any additional instrumentation.

### Location

- WASM-on-Node bench: `crates/grida-canvas-wasm/lib/__test__/bench-load-scene.test.ts`
- Run: `cd crates/grida-canvas-wasm && npx vitest run __test__/bench-load-scene.test.ts`
- Reuses build artifacts from `crates/grida-canvas-wasm/lib/bin/`
- Requires a local `.grida` fixture with a large node count (e.g. 136k nodes) placed in `fixtures/local/perf/local/`
