---
title: "Skia GPU Primitives Benchmark"
---

# Skia GPU Primitives Benchmark

Platform: Apple M2 Pro, Metal 4.1, 1000x1000 viewport, `--release`

Measured with `bench_skia_primitives.rs` (headless GPU, no window overhead).

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
cargo run -p cg --example bench_skia_primitives --features native-gl-context --release
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

#### 4. Effect batching / atlas (medium impact, complex)

Instead of one texture per node, pack multiple cached node images into a
single large texture (texture atlas). Blit sub-regions with `draw_image_rect`

- source rect. Same-texture batching → 0.3 µs/blit.

For 2000 nodes in a 4096x4096 atlas, each 32x32:

- Fits 128×128 = 16384 nodes → 1 texture
- 2000 blits of same texture = 600 µs (vs 4800 µs with different textures)

**Correctness:** Fully correct — atlas is just a storage optimization.
Blending is applied per-quad in the blit paint.

**Verdict:** Medium complexity. Requires packing algorithm and atlas
management. Worth it when per-node caching is the chosen strategy.

#### 5. Solid color / trivial node optimization (low impact, simple)

Detect nodes where the entire render output is a single solid color.
Replace the draw with a single `draw_rect`. Skip SkPicture replay entirely.

Chromium does this with `kMaxOpsToAnalyze = 5`.

**Verdict:** Simple, small impact for most scenes.

### What "just works" and what needs design decisions

| Item                           | Just works?                         | Design decision needed?                     |
| ------------------------------ | ----------------------------------- | ------------------------------------------- |
| Per-node SkPicture cache       | Yes — already working               | No                                          |
| Per-node SkImage for effects   | Yes — working for &lt;100 nodes     | No                                          |
| LOD during interaction         | Yes — pure quality trade-off        | Yes: how much degradation is acceptable     |
| Viewport effect culling        | Yes — pure optimization             | No                                          |
| Texture atlas                  | Yes — storage optimization          | No                                          |
| Container-level caching        | **Partially** — clipped+Normal only | Yes: what to do with non-clipped containers |
| Backdrop blur                  | **No** — must always live-draw      | Constraint: accept this                     |
| Non-Normal blend vs background | **No** — must live-draw at root     | Constraint: accept this                     |

---

## Chromium's Render Surface Model — The Real Solution

The second research round revealed the actual mechanism Chromium uses.
It's not tiling per se — it's **render surfaces (render passes)**.

### How Chromium solves every "hard" case

Chromium's compositor has an **effect tree**. Every node in the effect tree
that has a "hard" property (blend mode, filter, opacity with children,
backdrop-filter, clip-path, etc.) gets a **render surface** — its own
offscreen GPU texture.

The pipeline:

```
1. Effect tree analysis → identify which nodes need render surfaces
2. Build render passes in dependency order (leaves first)
3. Draw passes:
   - Each pass: draw all children (tiles, quads) into offscreen texture
   - Apply filter to the entire texture (not per-tile)
   - Composite into parent pass with blend mode + opacity
   - For backdrop-filter: saveLayer with backdrop reads parent pass content
4. Root pass → screen
```

**This solves every case:**

| Problem                      | Chromium's mechanism                                                     |
| ---------------------------- | ------------------------------------------------------------------------ |
| Blur/shadow crosses boundary | Filter applied to entire render surface, not per-tile                    |
| Blend mode vs background     | Surface composited into parent with blend mode applied to entire content |
| Backdrop blur reads behind   | `saveLayer` with backdrop filter reads parent pass pixels                |
| Opacity with children        | Opacity applied to entire surface, not per-child                         |
| Clip-path                    | Applied to entire surface output                                         |

**Key insight**: Effects are NEVER applied per-tile or per-node at the
compositing level. They are applied to the **entire render surface** as a
post-process when that surface is composited into its parent.

### What triggers a render surface (~20 reasons)

From `cc/trees/property_tree_builder.cc:334-431`:

- Any CSS filter (blur, drop-shadow, etc.)
- Backdrop filter
- Blend mode other than Normal (SrcOver)
- Opacity < 1.0 with 2+ drawing descendants
- 3D transform flattening
- Clip-path
- Mask
- Copy request (screenshot)

**Simple nodes do NOT get render surfaces.** A `<div>` with `box-shadow`
is painted into its parent's tiles. Only the cases where per-tile/per-quad
handling is incorrect get isolated.

### How this maps to Grida

Grida's `save_layer` in the Painter already implements the same concept:

- `with_blendmode()` → `canvas.save_layer()` with blend
- `with_opacity()` → `canvas.save_layer_alpha()`
- Layer blur → `SaveLayerRec` with `image_filter`
- Backdrop blur → `SaveLayerRec` with `.backdrop()`

**Skia's `save_layer` IS a render surface.** We are already using the same
mechanism Chromium uses. The difference is that Chromium pre-computes the
render surface tree once and caches/reuses it, while Grida re-creates the
`save_layer` stack every frame.

### The actual gap: Chromium caches the TILE CONTENT, not the effect output

Chromium's caching model:

```
Tiles (rasterized content, no effects) ← CACHED as GPU textures
  ↓
Render surface (applies effects to tiles as a group) ← NOT cached
  ↓
Parent render surface
  ↓
Screen
```

Tiles contain raw painted content WITHOUT effects. Effects are applied at
compositing time by the render surface. This means:

- On pan: tiles shift, render surface re-composites (effects re-run)
- On idle: same cost as active (no "stable frame" quality difference)
- On content change: only affected tiles re-rasterize

Chromium does NOT cache the effect output. It re-applies blur/shadow filters
every frame via the render surface. The reason it's fast enough: Chromium's
tile rasterization is on worker threads, and the effect application happens
in the display compositor (viz) which is highly optimized.

### Why Chromium is fast with effects and Grida is not

| Factor             | Chromium                                            | Grida                          |
| ------------------ | --------------------------------------------------- | ------------------------------ |
| Tile rasterization | Worker threads (32 concurrent)                      | Main thread                    |
| Effect application | viz SkiaRenderer (single optimized pass)            | Per-node save_layer in Painter |
| Draw call batching | viz batches by texture                              | No batching                    |
| Tiling             | Tiles contain raw content, effects applied to group | No tiling                      |
| SkPicture          | Uses DisplayItemList (more efficient)               | Uses SkPicture per-node        |

The single biggest factor: **Chromium rasterizes tiles on 32 worker threads.**
Even at 220µs per shadow, 32 threads process 2000 shadows in ~14ms.
Grida does it on 1 thread → 440ms.

---

## Revised Actionable Items

### Tier 1: Immediate wins (no architecture change)

**1a. Effect LOD during interaction.**
During pan/zoom, reduce effect quality. Use SkPicture variant keys to
record two versions: full-quality and fast. Switch on `stable` flag.

- Shadows: reduce blur radius to 0 (sharp shadow, still visible)
- Blur: reduce radius by 4x
- Expected improvement: 10-50x for effect-heavy scenes during interaction

**1b. Viewport effect bounds culling.**
Skip `save_layer` + effect filter for nodes whose expanded effect bounds
are entirely outside the viewport. Currently effects are processed for
all visible nodes even when the effect expansion is offscreen.

### Tier 2: Medium-term (targeted architecture work)

**2a. Worker-thread rasterization for SkPicture.**
Move `draw_layer()` calls (or SkPicture recordings) to worker threads.
The recorded Pictures can be replayed on the main thread's GPU canvas.
This directly addresses the single-thread bottleneck.

**2b. Group-level render surface caching.**
Cache the output of `save_layer` groups (containers with effects) as GPU
textures. Invalidate when any child changes. This is the render surface
equivalent of Chromium's tiling — cache the composited result, not
individual nodes.

Correct for:

- Containers with clip:true
- Groups where no child has backdrop-filter
- Groups where blend mode is Normal against external content

### Tier 3: Long-term (full architecture)

**3a. Tile-based rasterization.**
Divide the scene into a viewport tile grid. Each tile is rasterized into
a GPU texture containing all nodes that overlap it. Effects within a tile
are rendered correctly because the tile contains full context.

Cross-tile effects: handled by expanding tile bounds (Chromium does this
with `ExpandClipForPixelMovingFilter`).

**3b. Effect tree / render surface tree.**
Build an explicit effect tree from the scene graph. Pre-compute which
subtrees need render surfaces. Cache the tree structure and only recompute
when the scene changes.

## Related

- [Optimization Strategies](./optimization.md)
- [Chromium Compositor Research](../research/chromium/index.md)
