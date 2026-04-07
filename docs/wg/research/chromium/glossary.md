---
title: "Chromium Compositor — Glossary"
tags:
  - internal
  - research
  - chromium
  - rendering
  - compositing
---

# Chromium Compositor — Glossary

Key terms and concepts from the Chromium compositor (`cc/`) and display
compositor (`viz/`).

---

## Core Concepts

### Layer

A composited element in the layer tree. Each layer has properties (transform,
opacity, blend mode, filters, clip) and content (painted via display items).
Not every DOM element becomes a layer — only those with specific compositing
reasons.

Source: `cc/layers/layer.h`, `cc/layers/layer_impl.h`

### Layer Tree

The tree of composited layers. Chromium maintains two copies:

- **Active tree**: currently displayed on screen
- **Pending tree**: being prepared with new content (raster in progress)

When the pending tree is ready, it is **activated** (swapped to become the
active tree).

Source: `cc/trees/layer_tree_impl.h`, `cc/trees/layer_tree_host_impl.h`

### Property Trees

Separate trees for transform, effect, clip, and scroll properties. Each
layer references nodes in these trees by index rather than storing properties
directly. This allows efficient property inheritance and change tracking.

The four trees:

- **TransformTree**: world transforms, 3D flattening
- **EffectTree**: opacity, blend mode, filters, render surfaces
- **ClipTree**: clip rects, clip paths
- **ScrollTree**: scroll offsets, scroll containers

Source: `cc/trees/property_tree.h`, `cc/trees/effect_node.h`,
`cc/trees/transform_node.h`

### Effect Node

A node in the EffectTree. Carries opacity, blend mode, filters, backdrop
filters, and determines whether a render surface is needed.

Source: `cc/trees/effect_node.h`

### Render Surface (Render Pass)

An offscreen GPU texture that a subtree is composited into before being
drawn into its parent. Created when an effect cannot be applied per-quad
(e.g., blend mode, filter, opacity with multiple children, backdrop filter).

The cc-side abstraction is `RenderSurfaceImpl`. The data sent to the
display compositor is `CompositorRenderPass`.

Source: `cc/layers/render_surface_impl.h`,
`components/viz/common/quads/compositor_render_pass.h`

### Compositing Reason

A bitmask describing why a DOM element was promoted to its own composited
layer. There are approximately 40 reasons, including: 3D transforms, active
animations, `will-change`, fixed/sticky positioning, iframes, video, canvas,
backdrop filters, overlap with other composited layers.

Source: `third_party/blink/renderer/platform/graphics/compositing_reasons.h`

---

## Tiling

### Tile

A rectangular region of a layer's content, rasterized into its own GPU
texture (SharedImage). Tiles are the unit of rasterization and caching.

Source: `cc/tiles/tile.h`

### PictureLayerTiling

A grid of tiles at a specific raster scale for a `PictureLayerImpl`. Each
layer may have multiple tilings at different scales (HIGH_RES, LOW_RES, etc.)
but typically has exactly one HIGH_RESOLUTION tiling.

Source: `cc/tiles/picture_layer_tiling.h`

### TilingData

The math for dividing a rectangular area into a tile grid. Handles borders,
tile sizes, and iteration order.

Source: `cc/base/tiling_data.h`

### Tile Size

Default tile size depends on rasterization mode:

- CPU raster: 256x256 pixels
- GPU raster: width = viewport width, height = viewport height / 4

Tile sizes are aligned to multiples of 32 (GPU) or 4 (minimum). Tile borders
overlap by 1 pixel for anti-aliasing (`kBorderTexels = 1`).

Source: `cc/layers/tile_size_calculator.cc`,
`cc/trees/layer_tree_settings.cc`

### Tile Resolution

Each tiling has a resolution:

- `HIGH_RESOLUTION`: the ideal scale, actively rasterized
- `LOW_RESOLUTION`: a lower scale for fallback
- `NON_IDEAL_RESOLUTION`: a previous scale kept as backup, not actively
  rasterized

At most one HIGH_RESOLUTION tiling exists per layer at any time.

Source: `cc/tiles/tile.h` (`TileResolution` enum)

---

## Rasterization

### DisplayItemList

Chromium's recording format for paint operations. Analogous to Skia's
`SkPicture` but with additional metadata. Records paint ops from Blink's
painting phase and is replayed during tile rasterization.

Source: `cc/paint/display_item_list.h`

### RasterSource

An immutable snapshot of a `RecordingSource` (which holds the
`DisplayItemList`). Created on the main thread, consumed on worker threads
for rasterization. Thread-safe by design.

Source: `cc/raster/raster_source.h`, `cc/layers/recording_source.h`

### GPU Rasterization (OOP-R)

Out-of-Process Rasterization. Paint ops are serialized and sent to the GPU
process, which replays them via Skia/Ganesh/Graphite on the actual GPU
surface. This is the primary rasterization path in modern Chromium.

The raster command is `RasterCHROMIUM`, which replays a `DisplayItemList`
into a tile's `SharedImage`.

Source: `cc/raster/gpu_raster_buffer_provider.cc`

### One-Copy Rasterization

Fallback rasterization path. Content is rasterized to a CPU-side staging
buffer, then copied to the tile's GPU texture. Uses `StagingBufferPool`
to manage temporary buffers.

Source: `cc/raster/one_copy_raster_buffer_provider.h`,
`cc/raster/staging_buffer_pool.h`

### Worker-Thread Rasterization

Tile rasterization runs on a `TaskGraphRunner` pool of worker threads.
The default limit is 32 concurrent raster tasks. Each task rasterizes one
tile by replaying the `RasterSource` into the tile's GPU resource.

Source: `cc/raster/raster_buffer_provider.h`,
`cc/tiles/tile_manager.cc`

---

## GPU Resources

### SharedImage

The modern GPU resource abstraction replacing raw GL textures. A
`ClientSharedImage` wraps a GPU texture with cross-process sharing
capabilities via `gpu::Mailbox`. Each tile gets its own SharedImage.

Source: `gpu/command_buffer/client/client_shared_image.h`

### ResourcePool

Manages a pool of GPU resources (SharedImages). Tiles acquire resources from
the pool; released resources are recycled for future use if the size/format
match. Allows non-exact size reuse within a 2x area threshold. Resources
expire after 5 seconds of disuse.

There are **no texture atlases**. Each resource is an individual GPU texture.

Source: `cc/resources/resource_pool.h`, `cc/resources/resource_pool.cc`

### StagingBufferPool

Pool of temporary GPU memory buffers for the one-copy rasterization path.
Default budget: 32 MB.

Source: `cc/raster/staging_buffer_pool.h`

---

## Compositing Pipeline

### CompositorFrame

The data structure sent from the compositor to the display compositor (viz).
Contains a list of `CompositorRenderPass` objects, each with a `QuadList`.

Source: `components/viz/common/quads/compositor_frame.h`

### DrawQuad

A single drawing operation in a render pass. Types include:

- `TileDrawQuad`: draws a tile's GPU texture
- `SolidColorDrawQuad`: fills a solid color (no texture needed)
- `CompositorRenderPassDrawQuad` (RPDQ): draws the output of a child
  render pass (used for render surfaces with effects)
- `TextureDrawQuad`: draws an external texture (video, canvas, etc.)

Source: `components/viz/common/quads/draw_quad.h`,
`components/viz/common/quads/tile_draw_quad.h`

### SharedQuadState

Shared state for a group of quads in the same render pass: transform, clip,
opacity, blend mode. Multiple quads can reference the same SharedQuadState
to avoid redundancy.

Source: `components/viz/common/quads/shared_quad_state.h`

### SkiaRenderer

The display compositor's rendering backend. Receives `CompositorFrame`s and
draws them to the screen using Skia. Handles quad batching, render pass
execution, filter application, and backdrop filter reads.

For backdrop filters, it uses `SkCanvas::saveLayer` with a backdrop filter
parameter, which causes Skia to read current canvas content and apply the
filter.

Source: `components/viz/service/display/skia_renderer.cc`

---

## Interaction and Quality

### TreePriority

Controls which tree's tiles get rasterization priority:

- `SAME_PRIORITY_FOR_BOTH_TREES`: normal idle state
- `SMOOTHNESS_TAKES_PRIORITY`: during scroll/pinch, active tree tiles win
- `NEW_CONTENT_TAKES_PRIORITY`: when checkerboarding is detected

Source: `cc/tiles/tile_priority.h`

### TilePriority

Each tile has a priority based on spatial proximity to the viewport:

- `NOW`: visible in the current viewport
- `SOON`: in the skewport (velocity-predicted scroll target) or border region
- `EVENTUALLY`: in the larger interest area

Within a bin, tiles are sorted by `distance_to_visible` (Manhattan distance).

Source: `cc/tiles/tile_priority.h`

### Skewport

A velocity-extrapolated rectangle predicting where the user will scroll
next. Extends the visible rect in the scroll direction. Tiles in the
skewport get `SOON` priority for pre-rasterization.

Source: `cc/tiles/picture_layer_tiling_set.cc` (`ComputeSkewport`)

### Checkerboarding

When a frame is drawn with missing tiles (not yet rasterized). Instead of
blocking the frame, Chromium shows the background color or stale content.
This keeps interaction smooth at the cost of visual completeness.

Checkerboarding is tracked per-frame. If too many consecutive frames
checkerboard during animation, a forced redraw is triggered.

Source: `cc/tiles/checker_image_tracker.cc`,
`cc/scheduler/scheduler_state_machine.cc`

### Pinch-Zoom Raster Scale

During pinch-to-zoom, Chromium does NOT continuously update the raster
scale. Instead, it uses discrete jumps (multiples of a fixed ratio) and
snaps to existing tiling scales. The visual effect: content appears at a
slightly wrong resolution during the gesture and sharpens when the
gesture ends.

Source: `cc/layers/picture_layer_impl.cc` (`RecalculateRasterScales`)

---

## Constants and Limits

| Constant                    | Value        | Location                   |
| --------------------------- | ------------ | -------------------------- |
| Default tile size (CPU)     | 256x256      | `layer_tree_settings.cc`   |
| Max untiled layer size      | 512x512      | `layer_tree_settings.cc`   |
| GPU tile round-up           | 32px         | `tile_size_calculator.cc`  |
| Tile border overlap         | 1px          | `picture_layer_tiling.h`   |
| Memory budget (visible)     | 64 MB        | `layer_tree_settings.cc`   |
| Max resource count          | 10,000,000   | `managed_memory_policy.cc` |
| Max concurrent raster tasks | 32           | `layer_tree_settings.h`    |
| Staging buffer pool         | 32 MB        | `layer_tree_settings.h`    |
| Resource reuse threshold    | 2x area      | `resource_pool.cc`         |
| Resource expiration         | 5 seconds    | `resource_pool.h`          |
| Smoothness priority timer   | configurable | `proxy_impl.cc`            |
| Solid color analysis limit  | 5 ops        | `tile_manager.cc`          |
