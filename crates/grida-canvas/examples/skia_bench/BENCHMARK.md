---
title: "Skia GPU Primitives Benchmark"
---

# Skia GPU Primitives Benchmark

Platform: Apple M2 Pro, Metal 4.1, 1000x1000 viewport, `--release`

Measured with `skia_bench_primitives.rs` (headless GPU, no window overhead).

---

## Raw Primitive Costs

| Operation                                                | Per-call cost | Notes                                                  |
| -------------------------------------------------------- | ------------- | ------------------------------------------------------ |
| `draw_rect` (solid fill)                                 | **0.31 µs**   | GPU rect fill, fully batched                           |
| `draw_image_rect` (same texture)                         | **0.3 µs**    | GPU texture blit, batched (same texture)               |
| `draw_image_rect` (different textures)                   | **2.4 µs**    | **8x slower** — texture bind switching breaks batching |
| `draw_picture` (blur filter)                             | **220 µs**    | Per-node: blur kernel re-executes every replay         |
| `draw_picture` (shadow filter)                           | ~200 µs       | Similar to blur                                        |
| `image_snapshot_with_bounds` (sub-region from 4096x4096) | **61-264 µs** | Per-snapshot fixed cost (GPU copy)                     |

## Key Findings

### 1. Different textures are 8x more expensive than same texture

1000 blits of the same texture: **0.3 µs/blit** (348 µs total).
1000 blits cycling through 100 different textures: **2.4 µs/blit** (2415 µs total).

Skia's GPU backend (Ganesh) batches draw calls for same-texture quads into a
single GPU draw. Different textures force draw-call breaks + texture bind
switches. This means **per-node caching with individual textures is
fundamentally expensive at scale** — 2000 different node textures =
~4800 µs just in blit overhead, before any other work.

**Implication**: Group-level caching (many nodes → one texture) would
keep the blit cost at the same-texture rate (0.3 µs/blit).

### 2. SkPicture replay re-executes GPU effects

`draw_picture` replaying a picture with a blur/shadow `image_filter` costs
~220 µs/node. This is the blur kernel running on the GPU for each replay.
SkPicture **does not cache rasterized effect pixels** — it only caches the
draw command stream.

This confirms that for nodes with expensive effects, caching the rasterized
result as an `SkImage` is essential. A 220 µs shadow becomes a 0.3–2.4 µs
blit.

### 3. Rect fills scale linearly at 0.31 µs/rect

10000 rect fills: 3104 µs (322 fps). The GPU is not the bottleneck for
simple geometry. The per-rect cost is dominated by Skia's CPU-side command
submission, not GPU fill rate.

### 4. `image_snapshot_with_bounds` has a fixed ~60 µs cost

Extracting a sub-region from a 4096x4096 GPU surface costs ~60 µs regardless
of the region size (16x16 to 256x256). This is a GPU-side copy into a new
texture. For 2000 nodes, that's 120 ms of snapshot overhead alone during
initial cache warmup.

### 5. Same-texture blit is as fast as rect fill

When all blits use the same GPU texture, the cost (0.3 µs) matches raw rect
fill (0.31 µs). Skia treats same-texture `draw_image_rect` as a batched quad.

---

## Strategy Implications

### Per-node caching (current architecture)

- **Works well for**: small number of effect-heavy nodes (< 100)
- **Breaks down at**: large count of promoted nodes (> 500) due to
  texture-switching overhead (2.4 µs × 2000 = 4.8 ms) and
  snapshot warmup cost (60 µs × 2000 = 120 ms)
- **Verdict**: Keep for effect-heavy nodes, but the promotion threshold
  matters. At ~220 µs/shadow, even 20 cached shadows save 4 ms/frame.

### Group-level / tile caching (future architecture)

- Composite many nodes into a single large texture per group/tile
- Blit uses same-texture rate (0.3 µs) regardless of node count inside
- Invalidation scope: when one node in the group changes, the entire group
  texture must be re-rendered
- **Ideal for**: large scenes with many static nodes (containers, backgrounds)

### SkPicture replay (current cache)

- Already used: `PictureCache` records per-node `SkPicture` objects
- Eliminates Rust-side logic on replay (layout, shape building)
- **Does NOT eliminate GPU effect cost** — blur/shadow still 220 µs/replay
- Good baseline for simple geometry; insufficient for effect-heavy nodes

### Recommended hybrid approach

```
Cheap nodes (fill/stroke only):
  → SkPicture replay (0.31 µs/rect, already cached)

Expensive nodes (blur, shadow, noise):
  → Per-node SkImage cache (0.3–2.4 µs/blit vs 220 µs/replay)

Large static groups:
  → Group-level SkImage cache (many nodes → one texture)
  → Future work: tile-based or container-based compositing
```

---

## Benchmark reproduction

```bash
cargo run -p cg --example skia_bench_primitives --features native-gl-context --release
```

---

## Chromium Compositor Architecture (from source)

Examined from local chromium clone. Full research at
[docs/wg/research/chromium](../research/chromium/index.md).
Key findings that inform our strategy.

### Chromium does NOT use texture atlases

Each tile gets its own `SharedImage` (GPU texture). No atlasing. The
`ResourcePool` manages individual resources and recycles them by size/format.
The texture-switching cost is accepted as a trade-off for simplicity.

Search for "atlas" across all of `cc/` yields zero hits for tile compositing.

### Tiling, not per-node caching

Chromium tiles the viewport, NOT individual DOM elements:

| Setting                        | Value                     |
| ------------------------------ | ------------------------- |
| Default tile size (CPU raster) | **256x256**               |
| GPU raster tile height         | **viewport_height / 4**   |
| GPU tile width                 | **viewport_width**        |
| Tile alignment                 | 32px (GPU), 4px (minimum) |
| Tile overlap border            | 1px (for anti-aliasing)   |

A layer is divided into a grid of tiles. Each tile is rasterized independently
into its own GPU texture. During compositing, tiles are drawn as quads.

### Memory budget, not texture count limit

| Limit                       | Default                                   |
| --------------------------- | ----------------------------------------- |
| Memory budget (visible)     | **64 MB**                                 |
| Max resource count          | **10,000,000** (effectively unlimited)    |
| Max concurrent raster tasks | **32**                                    |
| Staging buffer pool         | **32 MB**                                 |
| Resource reuse threshold    | **2x area** (allows non-exact size reuse) |
| Resource expiration         | **5 seconds**                             |

Memory-gated, not count-gated. Tiles are evicted by priority
(NOW > SOON > EVENTUALLY) when budget is exceeded.

### Layer promotion is selective (~40 reasons)

A DOM element gets its own composited layer only for specific reasons:

- `will-change: transform/opacity/filter`
- Active CSS animation (transform, opacity, filter)
- 3D transform, `preserve-3d`
- Fixed/sticky positioning
- `<iframe>`, `<video>`, `<canvas>`
- Backdrop filter
- Overlap with another composited layer
- Overflow scrolling

**Simple `<div>` with a box-shadow does NOT get promoted.** The shadow is
painted as part of the parent layer's tile rasterization.

### Recording format: DisplayItemList, not SkPicture

Chromium uses its own `DisplayItemList` (not Skia's `SkPicture`) for
recording paint ops. The `RasterSource` replays these into tile textures
via `RasterCHROMIUM` (GPU out-of-process rasterization).

### The raster pipeline

```
Main thread:     Paint → DisplayItemList → RasterSource (immutable)
Worker threads:  RasterSource → tile GPU texture (via RasterCHROMIUM)
Impl thread:     TileManager prioritizes → TileDrawQuad per visible tile
Viz process:     SkiaRenderer draws quads, handles batching
```

The display compositor (viz) handles draw-call batching in `SkiaRenderer`,
which is downstream from the cc/ tile compositor.

### Solid color optimization

Tiles detected as solid color (≤5 paint ops, `kMaxOpsToAnalyze`) skip GPU
resources entirely and are drawn as `SolidColorDrawQuad`. This avoids
texture allocation for trivial content.

---

## Implications for Grida

### What Chromium teaches us

1. **Tile the viewport, don't cache individual nodes.** Chromium divides each
   layer into a tile grid. A tile contains the rasterized result of ALL nodes
   that overlap it. This amortizes the texture-switching cost.

2. **Selective layer promotion.** Only ~40 specific reasons cause a new
   composited layer. Box-shadow on a `<div>` does NOT create a new layer —
   it's rasterized into the parent's tiles.

3. **Memory budget, not node count.** The limiting factor is total GPU memory,
   not the number of cached items.

4. **Worker-thread rasterization.** Tiles are rasterized on worker threads,
   keeping the compositor thread free for frame submission. We currently
   rasterize on the main thread.

5. **No texture atlases.** Even Chromium pays the texture-switching cost.
   But with ~4 tiles per layer (viewport/4 height), the count stays low.

### How this maps to Grida's architecture

| Chromium concept         | Grida equivalent          | Status                        |
| ------------------------ | ------------------------- | ----------------------------- |
| Layer tree               | SceneGraph + LayerList    | Exists                        |
| Tile grid per layer      | —                         | **Not implemented**           |
| DisplayItemList          | SkPicture (PictureCache)  | Exists (per-node)             |
| Tile rasterization       | update_compositor         | Exists (per-node, needs tile) |
| TileDrawQuad             | compositor blit in draw() | Exists                        |
| Memory budget            | LayerImageCache budget    | Exists (128 MB)               |
| Compositing reasons      | PromotionStatus heuristic | Exists (effects-only)         |
| Solid color optimization | —                         | **Not implemented**           |
| Worker-thread raster     | —                         | **Not implemented**           |

### Why naive tiling is wrong for a design tool

Chromium accepts tile-boundary artifacts because CSS content is tolerant:

| Problem                                  | Chromium's workaround                           | Design tool requirement                     |
| ---------------------------------------- | ----------------------------------------------- | ------------------------------------------- |
| Shadow/blur bleed at tile edge           | 1px overlap border (handles AA, not large blur) | Pixel-perfect — 50px+ blur radii are common |
| Blend mode reads background across tiles | Accepted as limitation                          | Precise — any blend mode on any node        |
| Backdrop blur crosses tile               | Separate render pass (not tiled)                | Same — backdrop must see full background    |
| Effect expansion > tile size             | Clips at tile boundary                          | Not acceptable — shadows/glows extend far   |

**Naive viewport tiling would produce visible seams in a design tool.**

### Correct compositing boundaries for Grida

Instead of arbitrary viewport tiles, the compositing unit should be a
**natural isolation boundary** in the scene graph:

- **Containers with `clip: true`** — content doesn't bleed out, safe to
  cache the entire container as one texture
- **Containers with `BlendMode::Normal` and no mask** — children don't
  interact with siblings outside the container
- **Root-level leaf nodes** — isolated by definition (no parent container
  to bleed into)
- **Groups of adjacent nodes with no cross-node effects** — can be
  batched into a shared texture if no node's effect reads from another

Nodes with **backdrop blur** or **non-Normal blend modes that read from
content outside their subtree** must remain live-drawn — they break any
compositing boundary.

### The real bottleneck (measured)

| Scene (all-visible, fit-to-viewport)  | draw (CPU) | gpu_flush (GPU) | total  | FPS     |
| ------------------------------------- | ---------- | --------------- | ------ | ------- |
| 10K plain rects (no effects)          | 8.6ms      | 1.7ms           | 10.5ms | **95**  |
| 2K shadow rects (live draw)           | 18ms       | **414ms**       | 433ms  | **2.3** |
| 2K shadow rects (per-node compositor) | 31ms       | **428ms**       | 459ms  | **2.2** |
| 3.6K mixed (40% plain, 60% effects)   | 27ms       | **567ms**       | 595ms  | **1.7** |

**The bottleneck is `gpu_flush`** — the GPU processing expensive effects
(blur kernels, shadow filters). The per-node compositor doesn't help because:

- Live draw: GPU processes 2000 shadow filters = 414ms
- Cached blit: GPU blits 2000 different textures = 428ms (texture switching)
- Both are ~430ms. The compositor trades one GPU cost for another.

The only way to reduce this is to **reduce the number of GPU operations
per frame** — either by drawing fewer effects, or by caching at a
granularity where one GPU blit replaces hundreds of effects.

### Actionable items (concrete, ordered by impact)

#### 1. Container-level compositing (high impact, complex)

Cache entire clipped containers as single GPU textures. A container with
500 shadow children → 1 texture → 1 blit (0.3 µs) instead of 500 shadow
filter executions (110 ms).

**Correctness constraints:**

- Container must have `clip: true` — prevents effect bleed
- No child may have `backdrop_blur` — reads content outside container
- No child may have `BlendMode` that reads from content outside container
  (`Multiply`, `Screen`, `Overlay`, etc. against scene background are wrong
  if composited against container-internal content)
- Container bounds must be expanded by max child effect expansion

**Unsolvable cases** (must remain live-drawn):

- Nodes with backdrop blur/glass (reads scene content behind)
- Root-level nodes with non-Normal blend mode against scene background
- Nodes that straddle container boundaries (shouldn't exist with clip:true)

**Verdict:** Solvable for the common case (clipped frames with Normal blend
children). The unsolvable cases are well-defined and already excluded by the
current promotion heuristic.

#### 2. LOD / quality reduction during interaction (high impact, simple)

During active pan/zoom, render effects at reduced quality:

- Replace blur radius 8 with radius 2 during pan (4x faster)
- Skip inner shadows during pan (subtle, often invisible at small scale)
- Re-render at full quality on stable frames (50ms after interaction stops)

This is what Figma does — effects are visibly degraded during drag.

**Verdict:** Simple to implement, large impact. No correctness issues.

#### 3. Viewport-based effect culling (medium impact, simple)

Effects that are entirely outside the viewport are currently still processed
because the node's base geometry may be visible. But a shadow that extends
20px outside the viewport can be skipped.

**Verdict:** Pure optimization, no correctness issues.

#### 4. Effect batching / atlas — VALIDATED

Instead of one texture per node, pack multiple cached node images into a
single large texture (texture atlas). Blit sub-regions with `draw_image_rect`
source rect. Same-texture batching -> 0.3 us/blit.

**Microbenchmark results** (Apple M2 Pro, Metal, release, headless GPU,
200 iterations after 50 warmup):

Static blits (no camera transform):

| Node size | Count | Separate (us) | Atlas (us) | Speedup |
| --------- | ----- | ------------- | ---------- | ------- |
| 32x32     | 1000  | 2801          | 233        | 12.0x   |
| 32x32     | 2000  | 15503         | 444        | 34.9x   |
| 64x64     | 1000  | 980           | 137        | 7.2x    |
| 64x64     | 2000  | 3116          | 281        | 11.1x   |
| 100x100   | 1000  | 504           | 95         | 5.3x    |

Pan simulation (camera translates each frame, different destination
positions every frame, includes `flush_and_submit`):

| Node size | Count | Separate (us) | Atlas (us) | Speedup |
| --------- | ----- | ------------- | ---------- | ------- |
| 64x64     | 1000  | 727           | 118        | 6.2x    |
| 32x32     | 2000  | 8463          | 364        | 23.2x   |
| 100x100   | 1000  | 408           | 89         | 4.6x    |

Full compositor simulation (pan + per-node opacity + per-node blend mode,
64x64, 1000 nodes):

| Mode     | Total (us) | us/blit | FPS  | Speedup |
| -------- | ---------- | ------- | ---- | ------- |
| separate | 2329       | 2.3     | 429  | 1.0x    |
| atlas    | 747        | 0.7     | 1339 | 3.1x    |

**Key findings:**

1. Atlas sub-rect blits perform identically to same-texture blits. Skia
   batches them the same way.
2. The speedup scales super-linearly with count. At 2000 nodes (32x32),
   the atlas is 35x faster. This matches the non-linear GPU pipeline stall
   behavior observed in the blur-grid benchmark.
3. The advantage holds under pan (changing destination positions every
   frame). The GPU doesn't cache frame output — the atlas advantage comes
   purely from texture bind state, not position coherence.
4. Per-node opacity/blend breaks some batching (the full compositor
   simulation is 3.1x, not 6x), but the atlas still wins decisively.
5. Atlas performance matches same-texture performance almost exactly,
   confirming the hypothesis: texture switching is the bottleneck, and
   the atlas eliminates it.

**Correctness:** Fully correct — atlas is just a storage optimization.
Blending is applied per-quad in the blit paint.

**Verdict:** Validated. The atlas approach is worth implementing for the
per-node compositor. Expected real-world impact on blur-grid: the
compositing phase (`gpu_flush`) drops from ~137ms to ~10-20ms. Combined
with effect LOD (Phase 4), per-node blur scenes during pan should reach
30-60 fps.

Benchmark source: `crates/grida-canvas/examples/skia_bench/skia_bench_atlas.rs`

#### 5. Downscale during interaction

Render to a smaller offscreen during pan/zoom, then upscale to the
display with bilinear filtering. Reduces pixel count proportionally.

**Microbenchmark results** (Apple M2 Pro, Metal, release, headless GPU,
200 iterations after 50 warmup, 1000 blits of 64x64 sources):

Atlas blits (same texture) at varying target surface sizes:

| Target    | Time (us) | FPS  | us/blit |
| --------- | --------- | ---- | ------- |
| 2000x2000 | 405       | 2469 | 0.4     |
| 1000x1000 | 398       | 2513 | 0.4     |
| 500x500   | 377       | 2653 | 0.4     |
| 250x250   | 380       | 2632 | 0.4     |
| 100x100   | 373       | 2681 | 0.4     |

Separate-texture blits at varying target surface sizes:

| Target    | Time (us) | FPS | us/blit |
| --------- | --------- | --- | ------- |
| 2000x2000 | 8045      | 124 | 8.0     |
| 1000x1000 | 8101      | 123 | 8.1     |
| 500x500   | 8263      | 121 | 8.3     |
| 250x250   | 8343      | 120 | 8.3     |
| 100x100   | 8392      | 119 | 8.4     |

Plain draw_rect (no textures) at varying target sizes:

| Target    | Time (us) | FPS  | us/blit |
| --------- | --------- | ---- | ------- |
| 2000x2000 | 297       | 3367 | 0.3     |
| 1000x1000 | 335       | 2985 | 0.3     |
| 500x500   | 306       | 3268 | 0.3     |
| 250x250   | 303       | 3300 | 0.3     |
| 100x100   | 316       | 3165 | 0.3     |

Live blur (save_layer + gaussian blur filter, 100 nodes):

| Target    | Time (us) | FPS | us/blur | vs 2000x2000 |
| --------- | --------- | --- | ------- | ------------ |
| 2000x2000 | 21117     | 47  | 211.2   | 1.0x         |
| 1000x1000 | 15676     | 64  | 156.8   | 1.3x         |
| 500x500   | 15834     | 63  | 158.3   | 1.3x         |
| 250x250   | 13762     | 73  | 137.6   | 1.5x         |
| 100x100   | 10362     | 97  | 103.6   | **2.0x**     |

Live drop shadow (save_layer + drop_shadow filter, 100 nodes):

| Target    | Time (us) | FPS | us/shadow | vs 2000x2000 |
| --------- | --------- | --- | --------- | ------------ |
| 2000x2000 | 46532     | 21  | 465.3     | 1.0x         |
| 1000x1000 | 28244     | 35  | 282.4     | 1.6x         |
| 500x500   | 25721     | 39  | 257.2     | 1.8x         |
| 250x250   | 16950     | 59  | 169.5     | **2.7x**     |
| 100x100   | 16524     | 61  | 165.2     | **2.8x**     |

Mixed geometry (1000 rounded rects + strokes, no effects):

| Target    | Time (us) | FPS  | us/node |
| --------- | --------- | ---- | ------- |
| 2000x2000 | 786       | 1272 | 0.8     |
| 1000x1000 | 745       | 1342 | 0.7     |
| 500x500   | 764       | 1309 | 0.8     |
| 250x250   | 756       | 1323 | 0.8     |
| 100x100   | 771       | 1297 | 0.8     |

**Key findings:**

1. **Blits and plain geometry: zero impact from target size.**
   Atlas blits, separate-texture blits, plain rects, and rounded rects
   - strokes all produce identical frame times regardless of target
     surface size. The M2 Pro GPU is not fill-rate-bound at these
     workloads (small rects, simple shaders).

2. **Live effects: significant impact from target size.**
   Gaussian blur at 100x100 is **2.0x faster** than at 2000x2000.
   Drop shadow at 250x250 is **2.7x faster** than at 2000x2000.
   Skia's image filter pipeline allocates offscreen FBOs proportional
   to the filtered region. Smaller canvas = smaller save_layer FBOs
   = fewer fragment shader invocations for the blur kernel.

3. **The scaling is sub-linear.** Reducing from 2000x2000 to 100x100
   (400x fewer pixels) only gives 2-3x speedup on effects. This is
   because the GPU's fixed per-operation overhead (FBO allocation,
   filter dispatch, state changes) dominates over pixel fill at small
   sizes. There is a floor cost per save_layer regardless of size.

4. **Geometry without effects: no impact.** 1000 rounded rects +
   strokes render at ~760us regardless of target size. The vertex
   processing and rasterization are not fill-rate-bound at this scale.

5. The atlas vs separate texture difference (0.4 vs 8.0 us/blit, 20x)
   remains the dominant factor for compositor blits, constant across
   all target sizes.

**Conclusion:** Interaction downscaling is effective for scenes with
**live effect draws** (blur, shadow via save_layer). A 0.5x scale
gives ~1.3-1.6x speedup on effects. A 0.25x scale gives ~2-3x. It
does NOT help compositor blit workloads or plain geometry. The
optimization is worth keeping as a general strategy for live-draw
heavy frames, but it will not help compositor-cached scenes.

Benchmark source: `crates/grida-canvas/examples/skia_bench/skia_bench_downscale.rs`

## Related

- [Optimization Strategies](./optimization.md)
- [Chromium Compositor Research](../research/chromium/index.md)
