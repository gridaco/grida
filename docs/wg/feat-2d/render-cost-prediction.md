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

Reference sheet for computing GPU render cost of 2D scene operations
**before drawing**. All constants and formulas are derived from GPU
pipeline structure, not empirical tuning.

Related:

- [Rendering Optimization Strategies](./optimization.md) — implemented optimizations
- [Chromium Compositor Research](../research/chromium/index.md) — reference architecture

---

## Core Principle: Fill Rate Dominance

2D GPU rendering is **memory-bandwidth bound**, not compute bound. The
fragment shader for a rect fill is ~1 ALU op; even a Gaussian blur pass
is ~10 ALU ops per pixel. Modern GPUs execute trillions of ALU ops/sec,
but memory bandwidth is 50-200 GB/s. Each pixel read/write is 4-16 bytes.

Therefore:

```
frame_cost ≈ total_pixels_touched / memory_bandwidth
```

This relationship is **linear**. Double the pixels, double the time.
No surprises, no non-linear scaling — as long as you stay within VRAM
and don't hit texture cache thrashing (rare in 2D; access is spatially
coherent).

This means render cost can be pre-computed as an **ALU/pixel budget**:
count the pixels the GPU will touch, apply structural multipliers per
effect, and compare against a calibrated device budget.

---

## Effect Cost Constants

These are not magic numbers or tuning parameters. They are the
**structural pass counts** of each rendering operation — how many
full-area read-write cycles the GPU performs.

| Effect                                | Pixel Multiplier     | Derivation                                                 |
| ------------------------------------- | -------------------- | ---------------------------------------------------------- |
| Plain shape (rect, ellipse, polygon)  | `1×`                 | Single fill pass                                           |
| Additional fill (N fills on one node) | `+1×` per extra fill | Each fill is a separate pass                               |
| Additional stroke                     | `+1×` per stroke     | Separate pass                                              |
| Non-rect clip path                    | `+1×`                | Mask pass + masked content                                 |
| Rect clip                             | `+0×`                | Hardware scissor — free                                    |
| Blend mode (non-normal)               | `+1×`                | Requires offscreen isolation layer                         |
| Group opacity (alpha < 1.0 on group)  | `+1×`                | `save_layer` for isolated compositing                      |
| Gaussian blur                         | `+3×`                | Downsample pyramid (~1.33×) + blur + upsample + composite  |
| Drop shadow                           | `+5×`                | Draw shape (1×) + blur pipeline (3×) + composite back (1×) |
| Inner shadow                          | `+5×`                | Same as drop shadow, inverted mask                         |
| Backdrop filter (background blur)     | `+3×`                | Snapshot dst + blur + composite                            |
| Layer blur (on node itself)           | `+3×`                | Offscreen + blur + composite                               |
| Image fill                            | `+0×` over base      | Texture sample replaces color fill — same bandwidth        |
| Multiple shadows                      | `+5×` per shadow     | Each shadow is independent                                 |

### Blur Radius Independence

Skia (and most GPU frameworks) implement Gaussian blur via a **downsample
pyramid**, not a brute-force kernel convolution:

```
large sigma → downsample 2× → downsample 2× → ... → blur at reduced size → upsample
```

Total pixel work = `area × (1 + 1/4 + 1/16 + ...) ≈ area × 1.33` (geometric
series), plus the blur pass at reduced resolution. The cost is approximately
**constant regardless of blur radius**. The pyramid absorbs the radius.

### `save_layer` / `save_layer_alpha` — The Hidden Spike Source

`save_layer` is the single most expensive primitive in Skia. It allocates an
offscreen surface, renders content into it, then composites back.

```
save_layer_cost = layer_bounds_area × zoom² × 2  (write to offscreen + read back)
```

Critical: **they cascade multiplicatively with nesting depth**.

```
save_layer              ← offscreen A (full group bounds)
  save_layer            ← offscreen B (child bounds)
    save_layer          ← offscreen C (grandchild bounds)
      draw rect
    restore             → composite C into B
  restore               → composite B into A
restore                 → composite A into target
```

Three nested layers on the same area = `area × 6` bandwidth, not `area × 2`.

#### Implicit `save_layer` triggers

Skia inserts `save_layer` implicitly for these conditions. The cost estimator
must account for them even when the application code does not call `save_layer`
explicitly:

| Trigger                                   | Reason                                                          |
| ----------------------------------------- | --------------------------------------------------------------- |
| Non-normal blend mode on a group          | Isolated offscreen to blend against dst                         |
| Group opacity (alpha < 1.0 with children) | Children must composite together first, then alpha applied once |
| Blur / backdrop filter                    | Reads from dst, needs snapshot                                  |
| Clip + antialiasing on groups             | Soft-edge mask requires offscreen                               |
| `ColorFilter` on a group                  | Applied after children composite                                |

---

## Per-Node Cost Formula

```rust
fn estimated_fill_pixels(node: &Node, zoom: f32, viewport: &Rect) -> f64 {
    let screen_area = clipped_area(&node.bounds, viewport) * (zoom * zoom) as f64;

    // Base draw
    let mut passes: f64 = 1.0;

    // Extra fills/strokes beyond the first
    passes += (node.fill_count.saturating_sub(1)) as f64;
    passes += node.stroke_count as f64;

    // Effects
    for shadow in &node.shadows {
        if shadow.visible {
            passes += 5.0; // shape + blur pipeline + composite
        }
    }
    if node.has_blur() {
        passes += 3.0; // downsample + blur + composite
    }
    if node.has_backdrop_blur() {
        passes += 3.0;
    }

    // Isolation layers (implicit save_layer)
    if node.blend_mode != BlendMode::Normal {
        passes += 1.0; // offscreen + composite
    }
    if node.opacity < 1.0 && node.has_children() {
        passes += 1.0; // group opacity isolation
    }

    // Clip
    if node.has_non_rect_clip() {
        passes += 1.0; // mask pass
    }

    screen_area * passes
}
```

### Cache Hit vs. Miss Cost

A compositor/picture cache **hit** replaces the full rasterization pipeline
with a single texture blit:

| State      | Effective multiplier          | What happens                                         |
| ---------- | ----------------------------- | ---------------------------------------------------- |
| Cache miss | `passes ×` (from table above) | Full rasterization: path tessellation, fill, effects |
| Cache hit  | `~0.1×`                       | Single texture-sampled quad draw                     |

The cost difference is **100-1000×**. Cache state is a binary signal — the
single largest contributor to per-node cost variance.

---

## Device Fill Rate Reference

The total pixel budget depends on device fill rate — the one value that
varies per hardware. Everything else is derived from geometry and scene
structure.

### Calibration

Render a known workload (e.g., full-screen solid rect) and measure:

```
pixels_per_ms = (screen_width × screen_height) / render_time_ms
```

### Reference Values (order-of-magnitude)

| Platform                 | Expected pixels_per_ms |
| ------------------------ | ---------------------- |
| Desktop GPU (discrete)   | ~500M                  |
| Desktop GPU (integrated) | ~100M                  |
| WebGL (WASM, desktop)    | ~50-100M               |
| WebGL (WASM, mobile)     | ~10-30M                |

---

## Chromium Reference

Chromium's `cc/` compositor collects similar metrics but uses them differently:

| Metric                                | Chromium Location              | Chromium Usage                                                |
| ------------------------------------- | ------------------------------ | ------------------------------------------------------------- |
| `TotalOpCount()`                      | `cc/paint/display_item_list.h` | Solid-color analysis gate                                     |
| `num_slow_paths_up_to_min_for_MSAA()` | `cc/paint/display_item_list.h` | Page-level GPU raster veto                                    |
| `has_save_layer_ops()`                | `cc/paint/display_item_list.h` | LCD text decision                                             |
| `has_non_aa_paint()`                  | `cc/paint/display_item_list.h` | Antialiasing decisions                                        |
| `BytesUsed()` / `OpBytesUsed()`       | `cc/paint/display_item_list.h` | Tracing / debugging                                           |
| `AreaOfDrawText()`                    | `cc/paint/display_item_list.h` | Text coverage statistics                                      |
| Solid color analysis                  | `cc/tiles/tile_manager.cc`     | Skip rasterization for uniform tiles (`kMaxOpsToAnalyze = 5`) |

Chromium does **not** perform per-tile raster cost prediction. Tile
scheduling is purely spatial (viewport distance + scroll velocity) with
a memory budget constraint. Their architecture tolerates stale tiles
(multi-threaded raster catches up across frames). Ours cannot — we render
single-threaded with a hard per-frame deadline, requiring predictive
budgeting.

Local source: `/Users/softmarshmallow/Documents/Github/chromium/cc/`

---

## Skia `Picture` Metrics (Available for Free)

Skia's `Picture` object exposes complexity metrics that are already
computed during recording and cost nothing to query:

| Method                     | What it returns                    | Use                                |
| -------------------------- | ---------------------------------- | ---------------------------------- |
| `approximate_op_count()`   | Number of draw operations recorded | Secondary complexity signal        |
| `approximate_bytes_used()` | Serialized size of the picture     | Memory pressure / complexity proxy |

These are stored fields, not computations. They complement the pixel-area
model by capturing path complexity variance (a 1000-op picture with
complex beziers vs. a 3-op picture with simple rects at the same pixel
area).

---

## Linearity Bounds

The fill-rate model is linear under these conditions:

| Condition                          | Linear?             | Notes                                                  |
| ---------------------------------- | ------------------- | ------------------------------------------------------ |
| Work above ~10K pixels             | Yes                 | Below this, GPU launch overhead dominates (flat floor) |
| Spatial texture access (normal 2D) | Yes                 | Bandwidth-bound, no cache thrashing                    |
| Random texture access              | Can be super-linear | Rare in 2D rendering                                   |
| Tile-based GPU (mobile)            | Mostly              | Large nodes spanning many tiles add per-tile overhead  |
| Thermal throttling                 | N/A                 | Between-frame variance, not within-frame               |
| VRAM pressure / swapping           | Non-linear          | Catastrophic; avoid by staying within budget           |

For typical 2D canvas rendering (spatial access, nodes > 10K pixels),
the linear model holds.
