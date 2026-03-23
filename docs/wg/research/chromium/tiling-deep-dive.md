---
title: "Chromium Tiling Deep Dive"
format: md
tags:
  - internal
  - research
  - chromium
  - compositing
  - performance

---

# Chromium Tiling Deep Dive

Deep dive into Chromium's tiling implementation from source (`cc/`).
Extracted from the local Chromium clone. Covers tile sizing, grid layout,
rasterization, compositing draw path, invalidation, memory management,
and the pending/active tree model.

For high-level overview see [tiling-and-rasterization.md](./tiling-and-rasterization.md).

---

## 1. Tile Sizing

### Constants

| Constant                    | Value   | Source                    |
| --------------------------- | ------- | ------------------------- |
| Default tile size (CPU)     | 256x256 | `layer_tree_settings.cc`  |
| Max untiled layer (CPU)     | 512x512 | `layer_tree_settings.cc`  |
| GPU tile round-up           | 32      | `tile_size_calculator.cc` |
| CPU tile round-up           | 64      | `tile_size_calculator.cc` |
| Min alignment               | 4       | `tile_size_calculator.cc` |
| Min GPU tile height         | 256     | `layer_tree_settings.cc`  |
| Border texels               | 1       | `picture_layer_tiling.h`  |
| Snap texels (tiling origin) | 128     | `picture_layer_tiling.cc` |

### GPU Raster Tile Size Algorithm

1. Start with viewport size as base
2. Apply DSF adjustment (ceil rounding through DIP conversion)
3. Divide height by divisor (4 for wide content, 2 for medium, 1 for narrow)
4. Add `2 * kBorderTexels` (2px for 1px overlap per edge)
5. Round up to multiples of 32
6. Enforce minimum height 256
7. If content wider than tile, halve width and recalculate

Result: ~4 horizontal strips covering the viewport width.

### CPU Raster Tile Size

Fixed 256x256 with special cases:

- Narrow content: expand height to 512
- Short content: expand width to 512
- Small layers (both dims under 512): single 512x512 tile
- Final clamp: round up to 64, align to 4, cap at max texture size

### Backdrop Filter Masks

Always a single tile matching `content_bounds` — no grid subdivision.

---

## 2. Tile Grid Layout (TilingData)

### Grid Math

With tile size T and border B=1, the inner (non-overlapping) stride is
`T - 2*B = T - 2`. Tiles overlap by 1 texel on shared edges.

Number of tiles along an axis:

```text
num_tiles = max(1, 1 + (total_size - 3) / (T - 2))
```

### Tile Bounds

Each tile has two rects:

- **TileBounds**: the non-overlapping region "owned" by this tile
- **TileBoundsWithBorder**: full texture extent including 1px overlap into neighbors

Edge tiles at index 0 or the last index extend to the tiling boundary.

### Multi-Scale Tilings

A layer can have multiple tilings at different raster scales simultaneously:

- **HIGH_RESOLUTION**: The ideal scale for current zoom. Actively rasterized.
- **NON_IDEAL_RESOLUTION**: Stale-scale tilings kept as fallback. Not actively rasterized (no new tiles created). Eventually evicted.

LOW_RESOLUTION has been removed from the codebase. Only two resolution
levels remain.

During pinch-zoom, raster scale changes in discrete jumps — snaps to
nearest existing tiling rather than creating new ones at every zoom
increment. Content appears at slightly wrong resolution during fast
pinch; corrected when gesture ends.

The `TilingSetCoverageIterator` visits tilings in priority order:
ideal scale first, then higher-res, then lower-res. If a tile is missing
from the ideal tiling, it falls back to the next tiling.

---

## 3. What Goes Into a Tile

### Tiles contain flat rasterized content WITHOUT effects

The pipeline:

```text
Main thread:  Paint -> DisplayItemList -> RecordingSource (mutable)
Commit:       RecordingSource -> RasterSource (immutable, thread-safe)
Worker:       RasterSource::PlaybackToCanvas() -> tile GPU texture
```

Effects (filters, blend modes, opacity, transforms) are **not** baked
into tiles. They are applied during the draw phase via render surfaces.

### PlaybackToCanvas — The Clipping Mechanism

For each tile, `PlaybackToCanvas()`:

1. Translates canvas so tile's top-left = origin (0,0)
2. **Clips to tile bounds** (intersection of tile rect and playback rect)
3. Applies raster-to-recording transform (scale + translation)
4. Replays `DisplayItemList` — Skia's clip culls ops outside tile bounds

This spatial clipping is what makes tiling work: each tile only
rasterizes the portion of the display list that intersects it.

### Partial Raster

When only a sub-region of a tile changed (`invalidated_content_rect`):

- The old GPU resource is reused
- Only the invalidated rect is re-rasterized
- Requires: `use_partial_raster=true`, MSAA disabled, old resource available

---

## 4. Tile Drawing (Compositing Phase)

### AppendQuads — From Tile to Draw Quad

`PictureLayerImpl::AppendQuads()` iterates visible tiles via
`CoverageIterator` and emits:

| Tile Mode         | Quad Type          | GPU Resource?                       |
| ----------------- | ------------------ | ----------------------------------- |
| RESOURCE_MODE     | TileDrawQuad       | Yes — references tile's SharedImage |
| SOLID_COLOR_MODE  | SolidColorDrawQuad | No — just a color fill              |
| OOM_MODE          | SolidColorDrawQuad | No — checkerboard color             |
| Missing tile      | SolidColorDrawQuad | No — checkerboard color             |
| Whole layer solid | SolidColorDrawQuad | No — short-circuits entirely        |

### SharedQuadState — The Batching Mechanism

All tiles from a single layer share ONE `SharedQuadState` containing:
transform, opacity, blend mode, clip, rounded corners.

This is the fundamental batching unit. Since all tiles share the same
SQS, they are drawn with identical GPU state, enabling the renderer to
batch them into a single draw call.

### SkiaRenderer — The Actual GPU Draw

The draw path:

```text
TileDrawQuad
  -> ScopedSkImageBuilder (locks GPU resource, creates SkImage)
  -> AddQuadToBatch (accumulates into batched_quads_)
  -> FlushBatchedQuads
    -> SkCanvas::experimental_DrawEdgeAAImageSet()
    -> SINGLE Skia API call for N tiles
```

`experimental_DrawEdgeAAImageSet()` takes an array of (image, src_rect,
dst_rect, transform) entries and draws them in minimal GPU draw calls.
Skia handles texture binding and vertex batching internally.

### Batch Break Conditions

A batch is flushed when:

- Scissor rect changes
- Mask filter info changes
- Blend mode changes
- Sampling options change
- A non-batchable quad type appears (only TileDrawQuad, TextureContent,
  and AggregatedRenderPass are batchable)
- The quad has render pass filters (must draw individually)

Since all tiles from one layer share the same SQS (same scissor, blend,
mask filter), they are always batched together unless interrupted by
quads from another layer.

### Transform Deduplication

The batch system deduplicates transform matrices:

```cpp
if (batched_cdt_matrices_.empty() || batched_cdt_matrices_.back() != m) {
    batched_cdt_matrices_.push_back(m);
}
```

All tiles from the same layer have the same transform, so they share
one matrix entry in the batch.

---

## 5. Tile Invalidation

### Invalidation Flow

```text
Content change
  -> RecordingSource::SetNeedsDisplayRect(rect)
  -> InvalidationRegion accumulates rects (max 256, then coalesces to bbox)
  -> RecordingSource::Update() drains invalidation, re-records DisplayItemList
  -> Commit: invalidation Region passed to PictureLayerImpl
  -> PictureLayerTiling::Invalidate()
    -> Layer-space to content-space conversion
    -> TilingData::Iterator finds overlapping tiles
    -> Each affected tile: removed and immediately recreated
    -> New tile stores (invalidated_content_rect, old_tile_id)
```

### Invalidation Granularity

- **Input**: Arbitrary pixel-aligned rectangles via `SetNeedsDisplayRect()`
- **Coalescing**: `InvalidationRegion` stores up to 256 rects per frame.
  Beyond 256, collapses to a single bounding box (lossy, but never
  under-invalidates).
- **Tile mapping**: Only tiles whose content-space bounds intersect the
  invalidation rect are affected. A 50x50px change in a 256x256px tile
  grid typically affects 1-4 tiles.
- **Sub-tile precision**: Each new tile records the exact
  `invalidated_content_rect` within it, enabling partial raster.

### How Many Tiles Are Affected by a Single Node Change?

Only tiles overlapping the node's bounds. For a small element (e.g.
50x50px) in a 256x256 tile grid: typically **1 tile** (up to 4 if
straddling tile boundaries). The rest of the scene is untouched.

---

## 6. Pending / Active Tree Model

### Two-Tree Architecture

- **Pending tree**: Receives new content from main thread commits.
  Tiles are rasterized against this tree. Not displayed.
- **Active tree**: Currently displayed. Frames are drawn from this tree.
- **Activation**: Atomic swap from pending to active when required tiles
  are ready.

### Activation Gate

Activation is blocked until:

1. All `required_for_activation` tiles are `IsReadyToDraw()`
2. All GPU work (sync tokens) for those tiles is complete

Required tiles are: high-resolution visible tiles on the pending tree
that have an active twin (i.e., tiles that the user will see
immediately after activation).

### Tile Transfer During Activation

```cpp
PictureLayerTiling::TakeTilesAndPropertiesFrom(pending_twin, invalidation) {
    RemoveTilesInRegion(invalidation, false);  // remove invalidated from active
    // Move ALL remaining tiles from pending to active (zero-copy pointer swap)
    for each tile in pending_twin.tiles_ {
        tile.set_tiling(this);
        this.tiles_[index] = std::move(tile);
    }
}
```

Non-invalidated tiles are **transferred** (pointer move) from pending to
active. Only invalidated tiles need fresh raster. This is the mechanism
that prevents flicker: the old active tree continues rendering until the
new one is fully ready.

---

## 7. Tile Priority

### Priority Structure

Each tile has a `TilePriority` with three components:

1. **priority_bin**: NOW (visible), SOON (skewport/border), EVENTUALLY
2. **distance_to_visible**: Manhattan distance to viewport edge (pixels)
3. **resolution**: HIGH_RESOLUTION or NON_IDEAL_RESOLUTION

Comparison is strict bin ordering, then distance within the same bin.

### Spatial Priority Regions

| Region               | Priority Bin | How Computed                                 |
| -------------------- | ------------ | -------------------------------------------- |
| VISIBLE_RECT         | NOW          | Current viewport in tile coords              |
| PENDING_VISIBLE_RECT | NOW          | Viewport upon pending tree activation        |
| SKEWPORT_RECT        | SOON         | Velocity-extrapolated predicted visible area |
| SOON_BORDER_RECT     | SOON         | ~15% border around viewport                  |
| EVENTUALLY_RECT      | EVENTUALLY   | Max interest area padding (3000px default)   |

### Tree Priority

| Mode                         | When                  | Effect                               |
| ---------------------------- | --------------------- | ------------------------------------ |
| SMOOTHNESS_TAKES_PRIORITY    | Active scroll/pinch   | Active tree NOW tiles before pending |
| NEW_CONTENT_TAKES_PRIORITY   | After checkerboarding | Pending tree tiles get priority      |
| SAME_PRIORITY_FOR_BOTH_TREES | Normal idle           | Standard priority comparison         |

---

## 8. Memory Management

### Budget Values

| Platform                          | Budget                            |
| --------------------------------- | --------------------------------- |
| Desktop (default)                 | 512 MB                            |
| Desktop (large resolution)        | 1152 MB, capped at 1/4 system RAM |
| Android (low-end / under 2GB RAM) | 96 MB                             |
| Android (2GB+ RAM)                | 256 MB                            |

Soft limit = hard limit \* `max_memory_for_prepaint_percentage` / 100
(default 100%, so soft = hard).

### Resource Pool

Each tile gets its own GPU resource (SharedImage). **No texture atlas.**

- **Reuse threshold**: `kReuseThreshold = 2.0f` — a resource can be
  reused if its area is at most 2x the requested area and both
  dimensions are >= requested.
- **Expiration**: Unused resources expire after **5 seconds**.
- **Memory pressure**: On CRITICAL pressure, all unused resources are
  evicted immediately.
- **MRU ordering**: Unused resources are stored MRU-first. Reuse search
  iterates from MRU to LRU, favoring recently-used resources.

### Eviction

During `AssignGpuMemoryToTiles()`:

1. NOW tiles use hard memory limit
2. SOON/EVENTUALLY tiles use soft memory limit
3. When over budget: evict lower-priority tiles first
4. If still over budget after eviction: stop scheduling, mark tiles OOM
5. Idle cleanup after 5 minutes: evict all below visible priority

### Solid Color Optimization

Before allocating GPU memory for a tile:

1. Analyze the tile's display list (up to `kMaxOpsToAnalyze = 5` ops)
2. If content is a single solid color: store the color, skip raster
3. **No GPU resource allocated** — drawn as `SolidColorDrawQuad`

Per-layer analysis also runs with `kMaxOpsToAnalyzeForLayer = 10`.

---

## 9. Rasterization Modes

| Mode               | Where Runs                     | Concurrency                         | Notes                                                  |
| ------------------ | ------------------------------ | ----------------------------------- | ------------------------------------------------------ |
| GPU Raster (OOP-R) | GPU process via RasterCHROMIUM | Non-concurrent (1 at a time)        | Default. Sends DisplayItemList to GPU for Skia replay. |
| One-Copy           | CPU worker thread -> GPU copy  | Concurrent but normal priority only | CPU raster into staging buffer, then single GPU copy.  |
| Zero-Copy          | CPU worker thread              | Concurrent                          | CPU raster directly into scanout buffer. No GPU copy.  |

### Task Scheduling

Max concurrent raster tasks: **32** (default `scheduled_raster_task_limit`).

Task categories:

- NONCONCURRENT_FOREGROUND: GPU raster (only one at a time)
- FOREGROUND: Required/visible tiles (concurrent)
- BACKGROUND: Prepaint tiles (runs only when no foreground work)

### Task Graph

All raster tasks are submitted as a DAG with three sentinel tasks:

- `required_for_activation_done_task` (priority 1)
- `required_for_draw_done_task` (priority 2)
- `all_done_task` (priority 3)

Individual tile tasks start at priority 10, incrementing by 1 in queue
order.

---

## 10. Summary of Key Design Properties

### Why Tiling Produces Few GPU Texture Binds

- ~4 tiles per layer (viewport-width strips), ~5-20 layers per page =
  20-80 tile textures total per frame.
- All tiles from one layer share one SharedQuadState (same transform,
  opacity, blend mode, clip). `experimental_DrawEdgeAAImageSet()` draws
  them in one Skia API call.
- Tiles contain flat rasterized content only. Effects are applied at the
  render surface level, not per-tile. Tiles can be reused across frames
  regardless of effect changes.

### Tile Overlap Limitations

- `kBorderTexels = 1` handles anti-aliasing seams only. It does not
  handle large blur/shadow bleed. Pixel-moving filters (blur, shadow)
  that extend beyond a tile's bounds are handled by render surfaces,
  not by tile overlap.
- Blend modes that read from content across tile boundaries can produce
  artifacts. Chromium accepts this as a limitation.

### GPU Raster Concurrency

- GPU raster tasks are `NONCONCURRENT_FOREGROUND` — only one runs at a
  time, because they share a single GPU worker context.
- The 32-task concurrency limit applies to CPU raster and image decode
  tasks, not GPU raster.
- The speed advantage of Chromium's tile system comes from CPU raster
  parallelism (recording replay on worker threads) and the pending/
  active tree model (rasterize while displaying), not from GPU-side
  parallelism.

### No Texture Atlasing

Chromium does not use texture atlases for tiles. Each tile gets its own
`SharedImage` (GPU texture). The `ResourcePool` manages individual
resources and recycles them by size/format match. The texture-switching
cost is accepted because the tile count per frame is low (~4-20 per
layer).

---

## Source Files Referenced

All from the Chromium source tree (`chromium/`):

- `cc/layers/tile_size_calculator.cc/.h`
- `cc/tiles/picture_layer_tiling.cc/.h`
- `cc/tiles/picture_layer_tiling_set.cc/.h`
- `cc/tiles/tiling_set_coverage_iterator.cc/.h`
- `cc/tiles/tile.cc/.h`
- `cc/tiles/tile_manager.cc/.h`
- `cc/tiles/tile_task_manager.cc/.h`
- `cc/tiles/tile_priority.h`
- `cc/tiles/prioritized_tile.h`
- `cc/tiles/tile_manager_settings.h`
- `cc/raster/raster_source.cc/.h`
- `cc/raster/raster_buffer_provider.cc/.h`
- `cc/raster/gpu_raster_buffer_provider.cc`
- `cc/raster/one_copy_raster_buffer_provider.cc`
- `cc/raster/zero_copy_raster_buffer_provider.cc`
- `cc/layers/recording_source.cc/.h`
- `cc/layers/picture_layer_impl.cc/.h`
- `cc/trees/layer_tree_settings.cc/.h`
- `cc/trees/layer_tree_host_impl.cc`
- `cc/resources/resource_pool.cc/.h`
- `cc/base/invalidation_region.cc`
- `cc/base/math_util.h`
- `components/viz/common/quads/tile_draw_quad.cc/.h`
- `components/viz/common/quads/shared_quad_state.h`
- `components/viz/service/display/skia_renderer.cc`
