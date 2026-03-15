---
title: "Chromium Tiling and Rasterization"
---

# Chromium Tiling and Rasterization

## Tiling Model

Each `PictureLayerImpl` has a `PictureLayerTilingSet` which manages one or
more `PictureLayerTiling` objects at different scales. Each tiling is a grid
of `Tile` objects covering the layer's content area.

### Tile Sizes

Tile sizes depend on the rasterization mode:

**CPU rasterization:**

- Default: 256x256 pixels
- Max untiled layer: 512x512 (layers smaller than this are a single tile)

**GPU rasterization:**

- Width: viewport width
- Height: viewport height / 4 (the viewport is divided into ~4 horizontal strips)
- If content width <= viewport width / 2: fewer divisions
- Rounded up to multiples of 32 pixels
- Minimum height: 256 pixels

**Tile borders:** Each tile overlaps adjacent tiles by 1 pixel
(`kBorderTexels = 1`) to prevent seams from anti-aliasing at tile edges.

Source: `cc/layers/tile_size_calculator.cc`,
`cc/trees/layer_tree_settings.cc`, `cc/tiles/picture_layer_tiling.h`

### Tiling Scales

A layer may have multiple tilings at different raster scales:

- **HIGH_RESOLUTION**: the ideal scale for the current zoom level. At most
  one per layer. Actively rasterized.
- **LOW_RESOLUTION**: a lower-resolution fallback. Used when HIGH_RES tiles
  are not yet available.
- **NON_IDEAL_RESOLUTION**: a previously-active tiling at a stale scale.
  Kept in memory as a fallback but not actively rasterized (no new tiles
  are created).

When the zoom level changes, the HIGH_RES tiling is recalculated. Old
tilings become NON_IDEAL and are eventually evicted.

Source: `cc/tiles/picture_layer_tiling_set.cc`,
`cc/layers/picture_layer_impl.cc`

### No Texture Atlasing

Each tile gets its own GPU resource (SharedImage). There is no texture
atlas. The `ResourcePool` recycles individual resources by size/format,
allowing non-exact size reuse within a 2x area threshold.

Source: `cc/resources/resource_pool.cc`

## Rasterization Pipeline

### Recording

On the main thread, Blink paints content into a `DisplayItemList` — a list
of paint operations (draw rect, draw text, draw image, save/restore, etc.).
This is captured by a `RecordingSource` and snapshotted into an immutable
`RasterSource`.

`DisplayItemList` is Chromium's equivalent of Skia's `SkPicture`, but with
additional metadata for invalidation and analysis.

Source: `cc/paint/display_item_list.h`, `cc/layers/recording_source.h`,
`cc/raster/raster_source.h`

### Rasterization Modes

**GPU Rasterization (OOP-R — Out-of-Process Rasterization):**

The primary mode in modern Chromium. Paint operations are serialized and
sent to the GPU process, which replays them via Skia/Ganesh on the tile's
GPU texture.

The flow:

1. `GpuRasterBufferProvider` acquires a `SharedImage` from the resource pool
2. Sends `RasterCHROMIUM` command to the GPU process
3. GPU process replays the `DisplayItemList` into the SharedImage via Skia
4. A `SyncToken` is generated to track completion

Source: `cc/raster/gpu_raster_buffer_provider.cc`

**One-Copy Rasterization:**

Fallback mode. Content is rasterized to a CPU-side staging buffer (from
`StagingBufferPool`), then copied to the tile's GPU texture. Used when
direct GPU rasterization is not available.

Source: `cc/raster/one_copy_raster_buffer_provider.h`

**Software Rasterization:**

CPU-only mode. `RasterSource::PlaybackToCanvas()` replays the display
item list directly into an `SkCanvas` backed by a memory buffer. No GPU
involvement.

Source: `cc/raster/raster_source.cc`

### Worker-Thread Rasterization

Tile rasterization is performed on a pool of worker threads managed by
`TaskGraphRunner`. Each tile's rasterization is an independent task:

1. `TileManager` creates `RasterTaskImpl` for each tile that needs raster
2. Tasks are scheduled on the task graph with dependencies
3. Each task calls `RasterBufferProvider::Playback()` to rasterize the
   `RasterSource` into the tile's GPU resource
4. Completed tasks report back to `TileManager`

The default limit is 32 concurrent raster tasks.

Source: `cc/tiles/tile_manager.cc`, `cc/raster/raster_buffer_provider.h`

### Solid Color Optimization

Before rasterizing a tile, `TileManager` can analyze the `DisplayItemList`
content for the tile region. If the content consists of 5 or fewer paint
operations (`kMaxOpsToAnalyze = 5`) and resolves to a solid color, the tile
is marked as `kSolidColor`. No GPU resource is allocated — the tile is drawn
as a `SolidColorDrawQuad` instead of a `TileDrawQuad`.

Source: `cc/tiles/tile_manager.cc`

## Invalidation

When content changes, only affected tiles are invalidated and re-rasterized.
The `RecordingSource` tracks invalidation rects. When a new `RasterSource`
is committed to the pending tree, the `PictureLayerTiling` computes which
tiles overlap the invalidation region and marks them for re-rasterization.

Tiles outside the invalidation region retain their existing GPU textures.

Source: `cc/layers/recording_source.cc`,
`cc/tiles/picture_layer_tiling.cc`

## Draw Phase

Once tiles are rasterized, `PictureLayerImpl::AppendQuads()` walks the
visible tiles and emits draw quads:

- **`TileDrawQuad`** for rasterized tiles (references the tile's SharedImage
  by resource ID)
- **`SolidColorDrawQuad`** for solid-color tiles
- **`PictureDrawQuad`** for software-composited tiles (rare)

Missing tiles (not yet rasterized) are handled as checkerboarding — the
frame is drawn without them, showing the background color or stale content.

Source: `cc/layers/picture_layer_impl.cc`
