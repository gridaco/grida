---
title: "Investigation: Viewport Culling & Camera Caching"
status: rejected
date: 2026-03-22
---

# Investigation: Viewport Culling & Camera Caching

## Hypothesis

During view-only camera transforms (pan/zoom), skip drawing layers whose bounds fall outside the visible viewport. Cache Camera2D derived values (view matrix, inverse, zoom, world rect) to avoid redundant per-frame math.

## What Was Tried

1. **Camera2D caching** — `warm_cache()` precomputes view matrix, inverse, zoom, and world rect once per mutation. Read accessors (`view_matrix()`, `rect()`, `get_zoom()`, `screen_to_canvas_point()`) return cached fields in O(1).

2. **Viewport culling** — Before each `draw_layer` call, check if the layer's render bounds (from `GeometryCache`) intersect the camera's world rect. Skip layers that are entirely off-screen.

## Results

### Synthetic scenes (Criterion, CPU raster, 1920x1080)

Sparse grids where most nodes are off-screen:

| Metric | 100 nodes | 1K nodes | 10K nodes |
| ------ | --------- | -------- | --------- |
| Pan    | ~same     | **−46%** | **−85%**  |
| Zoom   | ~same     | **−32%** | **−81%**  |

### Real-world SVGs (headless, CPU raster, 1920x1080)

Dense content where most nodes overlap the viewport:

| Scene                            | Nodes | Pan Δ      | Zoom Δ     |
| -------------------------------- | ----- | ---------- | ---------- |
| Koppen-Geiger climate map (96MB) | 235K  | **+8.7%**  | **+13.3%** |
| San Francisco Bay map (40MB)     | 85K   | **+11.0%** | −7.3%      |
| Lorenz 3D attractor (20MB)       | 300K  | +3.5%      | ~same      |
| Lyon fortification map (30MB)    | 34    | −2.0%      | −3.0%      |
| Propane flame contours (30MB)    | 1.8K  | −6.5%      | −3.3%      |

## Why It Failed on Real Content

Linear viewport culling is **O(n) per frame** — every node's bounds are checked against the viewport. For dense scenes (maps, scientific visualizations), nearly all nodes pass the intersection test, so the check is pure overhead.

The synthetic benchmarks were misleading: a sparse grid at 10K nodes has ~90% off-screen at any given viewport, so culling skips most work. Real documents are the opposite — content is concentrated in the viewport.

## Conclusion

- **Camera caching**: safe but negligible (~30ns/frame savings vs 200ms+ frame times)
- **Linear viewport culling**: net negative on real content. Do not adopt without a spatial index.
- **Actual bottleneck**: Skia path rasterization dominates frame time on large scenes (235K paths = 800ms). CPU-side culling cannot fix this.

## What Would Actually Help

Per items 6, 12, and 36 in `optimization.md`:

- **Spatial index** (R-tree/quadtree, item 36) would make culling O(log n) instead of O(n)
- **Tile-based raster cache** (item 6) would avoid re-rasterizing static content on camera change
- **SkPicture caching** (item 5) with dirty-region invalidation would let Skia replay recorded ops instead of re-drawing paths

The draw stage (Skia path rasterization) is where 95%+ of frame time goes on large scenes. Optimizations must target that.
