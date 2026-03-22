---
title: "Chromium Compositor Architecture"
---

# Chromium Compositor Architecture

The Chromium compositor (`cc/`) is responsible for taking painted content
from the rendering engine (Blink), organizing it into a layer tree,
rasterizing it into GPU textures, and submitting frames to the display
compositor (viz) for final rendering to the screen.

## The Three Threads

Chromium's compositor runs across three thread contexts:

1. **Main thread** — Blink paints content into `DisplayItemList`s.
   `RecordingSource` captures these into immutable `RasterSource` snapshots.

2. **Compositor (impl) thread** — Manages the layer tree, computes draw
   properties, schedules tile rasterization, builds compositor frames.
   Runs `LayerTreeHostImpl`.

3. **Worker threads** — A pool of `TaskGraphRunner` threads (up to 32)
   that perform tile rasterization in parallel.

Additionally, the **GPU process** (separate process) handles actual GPU
command execution for out-of-process rasterization.

## Two Trees: Active and Pending

The compositor maintains two copies of the layer tree:

- **Pending tree**: receives new content from the main thread via commits.
  Tiles are rasterized against this tree.
- **Active tree**: the currently displayed tree. Frames are drawn from this
  tree.

When the pending tree's required tiles are rasterized, it is **activated**
(atomically swapped to become the active tree). This ensures the displayed
content is always consistent.

## The Frame Pipeline

```text
Main Thread:
  Blink paint → DisplayItemList → RecordingSource.Update()
  RecordingSource.CreateRasterSource() → RasterSource (immutable)
  Commit → push RasterSource to pending tree

Impl Thread:
  PictureLayerImpl receives RasterSource
  TileSizeCalculator computes tile dimensions
  PictureLayerTiling creates tile grid
  TileManager.PrepareTiles():
    → AssignGpuMemoryToTiles() (prioritize, evict)
    → Schedule RasterTasks on worker threads

Worker Threads:
  RasterTaskImpl.RunOnWorkerThread():
    → Acquire resource from ResourcePool
    → RasterBufferProvider.Playback():
      → GPU: ri->BeginRasterCHROMIUM / RasterCHROMIUM / EndRasterCHROMIUM
      → CPU: RasterSource.PlaybackToCanvas()
    → Generate SyncToken for GPU completion

Impl Thread (continued):
  TileManager.PrepareToDraw() → finalize completed raster
  LayerTreeHostImpl.CalculateRenderPasses():
    → Walk layer tree front-to-back
    → PictureLayerImpl.AppendQuads() → TileDrawQuad per visible tile
    → RenderSurfaceImpl.AppendQuads() → RenderPassDrawQuad for surfaces
  LayerTreeHostImpl.DrawLayers():
    → GenerateCompositorFrame()
    → SubmitCompositorFrame() → send to viz

Display Compositor (viz):
  Surface aggregation (merge frames from multiple processes)
  SkiaRenderer draws quads to screen
```

## Key Architecture Decisions

### No texture atlases

Each tile gets its own GPU resource (SharedImage). The `ResourcePool`
recycles individual resources by size/format match. There is no texture
atlas or sprite sheet packing.

### Content recording, not pixel caching

The `RasterSource` holds a `DisplayItemList` (draw commands), not
rasterized pixels. Tiles are rasterized from this command list. When content
changes, only affected tiles need re-rasterization — the command list is
cheaply updated.

### Render surfaces for effect isolation

Effects that cannot be applied per-quad (blend modes, filters, backdrop
filters, opacity with children) get their own render surface — an offscreen
texture that the subtree is composited into before the effect is applied.
See [render-surfaces.md](./render-surfaces.md).

### Memory-gated, not count-gated

The system limits total GPU memory, not the number of tiles or layers.
Tiles are evicted by priority when the memory budget is exceeded. The
default budget is 64 MB for visible content.

Source: `cc/trees/layer_tree_host_impl.cc`, `cc/tiles/tile_manager.cc`,
`cc/trees/layer_tree_settings.cc`
