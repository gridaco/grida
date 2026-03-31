---
title: Render Cost Prediction
format: md
tags:
  - internal
  - wg
  - canvas
  - performance
  - rendering
  - frame-budget
---

# Render Cost Prediction

Reference sheet for estimating GPU render cost of 2D scene operations
**before drawing**. Each claim is labeled as one of:

- **FACT** — verified from Skia/Chromium source or hardware specification
- **BENCHMARK** — measured locally (Apple M2 Pro, Metal 4.1, Skia 0.93)
- **INFERENCE** — derived from facts and benchmarks, not directly proven
- **HEURISTIC** — useful approximation, known to have exceptions

Related:

- [Rendering Optimization Strategies](./optimization.md) — implemented optimizations
- [Chromium Compositor Research](../research/chromium/index.md) — reference architecture

---

## Dominant Cost: Fixed Overhead per Operation

> **BENCHMARK** — Confirmed by measuring identical effects at 200² through
> 4000² pixels (100× area range). Per-pixel cost component is near zero;
> total time is constant regardless of area.

On our measured hardware (M2 Pro, Metal), the cost of most 2D operations
is dominated by **fixed per-operation overhead** — primarily GPU render
target switches (`save_layer` / FBO allocation) — not by pixel fill rate.

The fixed overhead comes from (**FACT**, traced to Skia/GL source):

1. **GPU texture allocation** (~15-30µs) — `glTexStorage2D()`, synchronous
   on most drivers. Skia's `GrResourceCache` pools textures to mitigate
   this, but cache misses still pay full cost.
2. **FBO state change** (~20-40µs) — `glFramebufferTexture2D()`, forces
   GPU pipeline flush. Unavoidable in GL/Metal immediate-mode API.
3. **Resource allocator** (~5-15µs) — CPU-side scratch key lookup in
   `GrResourceAllocator`.

Source: `skia/src/gpu/ganesh/GrGLGpu.cpp` (texture alloc),
`skia/src/gpu/ganesh/GrResourceAllocator.cpp` (scratch pool).

> **INFERENCE** — Many common 2D workloads are bandwidth-dominated for
> simple fills, but effects requiring `save_layer` (blur, shadow, blend
> mode isolation, group opacity) are dominated by fixed overhead at
> typical node sizes (< ~1M pixels). The pixel-proportional component
> becomes significant only at very large sizes or high zoom.

---

## Measured Fixed Cost per Operation

> **BENCHMARK** — Single rect, median of 50 runs after 10 warmup.
> Constant across 50²–4000² pixel area (R² ≈ 0 for most effects).

| Operation                    | C_fixed (µs) | What triggers it                            |
| ---------------------------- | ------------ | ------------------------------------------- |
| Baseline (no `save_layer`)   | ~12          | GPU draw call + flush overhead              |
| `save_layer_alpha` (opacity) | ~20          | 1 FBO switch                                |
| 2× nested `save_layer`       | ~32          | 2 FBO switches                              |
| 3× nested `save_layer`       | ~43          | 3 FBO switches (~11µs per additional layer) |
| Blur (σ=5)                   | ~73          | FBO + blur shader dispatch                  |
| Inner shadow (σ=6)           | ~72          | FBO + clip + shadow filter dispatch         |
| Blend mode (Multiply)        | ~81          | FBO + blend resolve                         |
| Drop shadow (σ=8)            | ~97          | FBO + shadow filter dispatch                |
| Backdrop blur (σ=8)          | ~110         | FBO + dst snapshot + blur                   |
| Blur (σ=50)                  | ~207         | FBO + multiple downsample dispatches        |
| Shadow + blur combo          | ~307         | 2 nested FBOs + both filter dispatches      |

> **INFERENCE** — For frame budget estimation, counting the number of
> `save_layer`-inducing operations and summing their fixed costs is more
> accurate than pixel-area-based prediction, at least up to ~16M pixels
> per node on this hardware.

---

## Blur Cost: Depends on Sigma

### Skia Constants

> **FACT** — From `skia/src/core/SkBlurEngine.h`.

- `kMaxSamples = 28` — max texture samples per GPU blur pass (hardcoded)
- `kMaxLinearSigma = 4.0` — max sigma for direct convolution (hardcoded)
- `SigmaToRadius(σ) = ⌈3 × σ⌉` — sigma-to-radius conversion
- `LinearKernelWidth(r) = r + 1` — samples per 1D pass (hardware bilinear)
- σ ≤ 0.03 is treated as identity (no-op)

### Skia Blur Strategy

> **FACT** — From `skia/src/gpu/ganesh/GrBlurUtils.cpp`.

```
σ ≤ 4.0 and small kernel  →  single 2D convolution pass (≤28 samples)
σ ≤ 4.0                   →  two separable 1D passes
σ > 4.0                   →  downsample until σ ≤ 4.0, blur, upsample (recursive)
```

For σ ≤ 4.0, the pass count varies:

- If `KernelWidth(rX) × KernelWidth(rY) ≤ 28`: single 2D pass
- Otherwise: two separable 1D passes

> **HEURISTIC** — The following formula estimates pass count for σ > 4.0.
> The exact count depends on image dimensions and Skia's internal
> rounding, so treat this as an approximation.

```rust
fn blur_pass_estimate(sigma: f32) -> u32 {
    if sigma <= 0.03 {
        return 0; // identity
    }
    if sigma <= 4.0 {
        return 2; // 1–2 passes (1D separable or single 2D)
    }
    let levels = ((sigma / 4.0).log2()).ceil() as u32;
    2 + levels * 2 // 2 blur passes + downsample/upsample per level
}
```

### Blur Radius Dependence

> **BENCHMARK** — Blur σ=50 is consistently ~2.8× more expensive than
> σ=5 across all tested sizes. This ratio is stable, confirming that
> cost scales with downsample level count.

| Size  | σ=5 (µs) | σ=50 (µs) | Ratio |
| ----- | -------- | --------- | ----- |
| 50²   | 74       | 211       | 2.87× |
| 100²  | 65       | 193       | 2.99× |
| 200²  | 73       | 207       | 2.84× |
| 500²  | 76       | 208       | 2.74× |
| 4000² | 77       | 230       | 3.00× |

### `reduce_blur()` — Interactive Quality Reduction

> **FACT** — From `crates/grida-canvas/src/painter/painter.rs`.

The painter implements `reduce_blur()` which divides sigma by 4×
during interactive frames (`RenderPolicy::EffectQuality::Reduced`).
This moves most blurs into the σ ≤ 4.0 direct convolution range.
Example: σ=20 → σ=5 (eliminates ~2 downsample levels).

---

## `save_layer` Triggers

> **FACT** — From Skia's `SkCanvas::internalSaveLayer()` and observed
> painter behavior. The cost estimator must account for implicit
> `save_layer` insertions even when the application code does not call
> `save_layer` explicitly.

| Trigger                                   | Reason                                  |
| ----------------------------------------- | --------------------------------------- |
| Non-normal blend mode on a group          | Isolated offscreen to blend against dst |
| Group opacity (alpha < 1.0 with children) | Children must composite together first  |
| Blur / backdrop filter                    | Needs offscreen for filter input        |
| Clip + antialiasing on groups             | Soft-edge mask requires offscreen       |
| `ColorFilter` on a group                  | Applied after children composite        |

> **FACT** — `save_layer` costs cascade with nesting depth.
> Each additional layer adds ~11µs fixed overhead (measured from
> 2× vs 3× nested `save_layer`: 32µs → 43µs).

### Blend Mode Tiers

> **FACT** — From `skia/src/gpu/Blend.h`, `skia/src/gpu/BlendFormula.h`,
> `skia/src/gpu/ganesh/effects/GrCustomXfermode.cpp`.

Not all blend modes have the same cost. Three tiers:

| Tier                   | Modes                                                                | Implementation                                      |
| ---------------------- | -------------------------------------------------------------------- | --------------------------------------------------- |
| Coefficient (cheapest) | Normal, Screen, SrcOver, Plus, Modulate                              | Hardware fixed-function blend — zero shader cost    |
| Simple advanced        | Overlay, HardLight, Darken, Lighten                                  | Shared shader, ~10-20 lines, separable              |
| Complex advanced       | ColorDodge, ColorBurn, SoftLight, Hue, Saturation, Color, Luminosity | Individual shaders, non-separable, guarded division |

> **INFERENCE** — The ~81µs measured for blend mode (Multiply) is
> entirely `save_layer` FBO overhead, not blend math. Multiply is a
> coefficient blend mode (cheapest tier). The blend mode tier affects
> ALU cost per pixel, which is negligible compared to FBO overhead at
> typical node sizes. Per-paint blend modes (no `save_layer`) are
> effectively free.

---

## Cache Hit vs. Miss

> **BENCHMARK** — Measured with `skia_bench_cache_blit`.

| State      | Cost                         | What happens                                                  |
| ---------- | ---------------------------- | ------------------------------------------------------------- |
| Cache miss | ~70-300µs (effect-dependent) | Full rasterization with FBO overhead                          |
| Cache hit  | ~5µs (constant)              | Single texture blit, independent of source complexity or size |

Hit/miss ratio for effect nodes: **~0.05×** (measured).
Blit cost is ~5µs regardless of source effect complexity — confirmed
with coefficient of variation check across 4 effect types.

> **BENCHMARK** — At scale (136K nodes, 2600 visible), the compositor
> cache serves all effect nodes as texture blits. Shadow and blur nodes
> show `cache_hits = 2704, live_draws = 0`. Effect multipliers only
> apply to **cache-miss frames** (first render, zoom change, scene
> mutation).

---

## Scale Behavior

> **BENCHMARK** — Full Renderer pipeline with R-tree culling, picture
> cache, and layer compositing. Measured with `skia_bench_scene_scale`.

### Per-Visible-Node Cost (stable frames)

| Scene Type       | 1K   | 5K   | 10K  | 50K  | 100K | 136K         |
| ---------------- | ---- | ---- | ---- | ---- | ---- | ------------ |
| Plain rects      | 0.41 | 0.38 | 0.40 | 0.43 | 0.54 | 0.89 µs/node |
| All with shadow  | 0.49 | 0.45 | 0.46 | 0.47 | 0.64 | 0.87 µs/node |
| All with blur    | 0.46 | 0.48 | 0.45 | 0.51 | 0.74 | 0.84 µs/node |
| Mixed (70/20/10) | 0.85 | 0.81 | 0.72 | 0.80 | 1.03 | 1.17 µs/node |

> **INFERENCE** — Per-visible-node cost is approximately additive
> (linear) from 1K to 50K total nodes. Non-linear overhead appears at
> 100K+ due to R-tree query and scene cache management scaling with
> total scene size, not drawing cost. Visible count caps at ~2600 nodes
> in a 1000×1000 viewport with 8×8 rects — R-tree culling works.

---

## Practical Cost Model

> **HEURISTIC** — Based on all benchmarks above. For frame budget
> decisions (skip or draw), the following is more accurate than
> pixel-area-based prediction at typical node sizes.

```
frame_cost ≈ Σ visible_nodes(
    if cache_hit:     ~5 µs
    if cache_miss:    C_fixed(effect_type)
)
```

Where `C_fixed` values are from the measured table above. The pixel-area
component is negligible up to ~16M pixels per node on tested hardware.

For nodes with multiple effects, sum the fixed costs (each effect
that triggers a `save_layer` adds its own FBO overhead).

### Calibration

Two device-specific constants must be measured at startup:

```
save_layer_overhead_us  = measured via single save_layer + draw + restore
pixels_per_ms           = measured via full-screen solid rect
```

Everything else is derived from scene structure (effect types, cache state).

---

## Device Fill Rate Reference

> **BENCHMARK** — Baseline solid rect at 500².

| Metric      | Value (M2 Pro)  |
| ----------- | --------------- |
| Fill rate   | ~146M pixels/ms |
| 12ms budget | ~1.8B pixels    |

> **HEURISTIC** — Order-of-magnitude reference.

| Platform                 | Expected pixels_per_ms |
| ------------------------ | ---------------------- |
| Desktop GPU (discrete)   | ~500M                  |
| Desktop GPU (integrated) | ~100M                  |
| WebGL (WASM, desktop)    | ~50-100M               |
| WebGL (WASM, mobile)     | ~10-30M                |

---

## Chromium Reference

> **FACT** — From `cc/paint/display_item_list.h`, `cc/tiles/tile_manager.cc`.

Chromium's `cc/` compositor collects these metrics:

| Metric                                | Location                       | Usage                                                         |
| ------------------------------------- | ------------------------------ | ------------------------------------------------------------- |
| `TotalOpCount()`                      | `cc/paint/display_item_list.h` | Solid-color analysis gate                                     |
| `num_slow_paths_up_to_min_for_MSAA()` | `cc/paint/display_item_list.h` | Page-level GPU raster veto                                    |
| `has_save_layer_ops()`                | `cc/paint/display_item_list.h` | LCD text decision                                             |
| `BytesUsed()` / `OpBytesUsed()`       | `cc/paint/display_item_list.h` | Tracing / debugging                                           |
| Solid color analysis                  | `cc/tiles/tile_manager.cc`     | Skip rasterization for uniform tiles (`kMaxOpsToAnalyze = 5`) |

> **INFERENCE** — Based on source review, Chromium does not appear to
> perform per-tile raster cost prediction. Tile scheduling is spatial
> (viewport distance + scroll velocity) with a memory budget constraint.
> Their multi-threaded raster architecture can tolerate stale tiles in
> ways our single-threaded pipeline cannot.

Local source: `/Users/softmarshmallow/Documents/Github/chromium/cc/`

---

## Skia `Picture` Metrics

> **FACT** — From `skia/include/core/SkPicture.h`.

| Method                     | Returns                            | Cost to query       |
| -------------------------- | ---------------------------------- | ------------------- |
| `approximate_op_count()`   | Number of recorded draw operations | Free (stored field) |
| `approximate_bytes_used()` | Serialized size of the picture     | Free (stored field) |

These capture path complexity variance that the fixed-cost model does
not account for (e.g., a 1000-op picture with complex beziers vs. a
3-op picture with simple rects).

---

## Benchmark Source

All benchmarks use `HeadlessGpu` (offscreen Metal/GL surface), median
of 50 iterations after 10 warmup, single rect per iteration unless
noted otherwise.

| Benchmark                | What it measures                                                                   |
| ------------------------ | ---------------------------------------------------------------------------------- |
| `skia_bench_cost_model`  | Per-effect fixed cost, linearity, blur radius, fill rate, two-component extraction |
| `skia_bench_cache_blit`  | Cache hit/miss ratio, blit constancy across effect types                           |
| `skia_bench_scene_scale` | Full Renderer pipeline at 1K–136K nodes with culling and caching                   |

Source: `crates/grida-canvas/examples/skia_bench/`
