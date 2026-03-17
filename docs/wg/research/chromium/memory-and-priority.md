---
title: "Chromium Memory Management and Tile Priority"
---

# Chromium Memory Management and Tile Priority

## Memory Budget

The compositor uses a soft/hard memory limit system rather than limiting
the count of tiles or textures.

### Limits

| Limit                               | Default    | Purpose                                        |
| ----------------------------------- | ---------- | ---------------------------------------------- |
| `bytes_limit_when_visible`          | 64 MB      | Initial memory budget for visible tabs         |
| `num_resources_limit`               | 10,000,000 | Effectively unlimited; memory is the real gate |
| `max_staging_buffer_usage_in_bytes` | 32 MB      | For one-copy raster staging buffers            |

The soft memory limit is `hard_limit * max_memory_for_prepaint_percentage / 100`
(default 100%, meaning soft = hard in the default configuration).

Source: `cc/trees/layer_tree_settings.cc`,
`cc/resources/managed_memory_policy.cc`

### Memory Policy Tiers

The system operates under one of four memory policies:

| Policy                   | What gets memory                   |
| ------------------------ | ---------------------------------- |
| `ALLOW_NOTHING`          | Invisible tabs — all tiles evicted |
| `ALLOW_ABSOLUTE_MINIMUM` | Only NOW-priority tiles            |
| `ALLOW_PREPAINT_ONLY`    | NOW + SOON tiles                   |
| `ALLOW_ANYTHING`         | All tiles including EVENTUALLY     |

The policy is set based on tab visibility and system memory pressure.

Source: `cc/tiles/tile_priority.h`

### Eviction

When memory exceeds the budget, `TileManager::AssignGpuMemoryToTiles()`
iterates the raster queue in priority order and stops scheduling when
the memory limit is reached. Tiles that don't fit get `OOM_MODE` and
are not rasterized.

NOW-priority tiles use the hard memory limit. SOON and EVENTUALLY tiles
use the soft limit (which can be smaller).

Source: `cc/tiles/tile_manager.cc`

## Tile Priority System

### Priority Bins

Each tile is assigned to one of three priority bins based on spatial
proximity to the viewport:

| Bin          | Meaning                                                 |
| ------------ | ------------------------------------------------------- |
| `NOW`        | Currently visible in the viewport                       |
| `SOON`       | In the skewport or border region (will be visible soon) |
| `EVENTUALLY` | In the larger interest area (might become visible)      |

### Spatial Priority Regions

The tiling computes several priority rectangles:

**VISIBLE_RECT** — the current viewport in tile coordinates. Tiles here
get `NOW` priority.

**SKEWPORT_RECT** — a velocity-extrapolated rectangle that predicts where
the user will scroll. Computed by taking the scroll velocity and
projecting it forward by a configurable target time. Tiles here get `SOON`
priority.

**SOON_BORDER_RECT** — a border (default ~15%) around the visible rect.
Also `SOON` priority. Covers small movements and direction uncertainty.

**EVENTUALLY_RECT** — a larger padding area. Tiles here get `EVENTUALLY`
priority and are rasterized only if memory allows.

Source: `cc/tiles/picture_layer_tiling.cc`

### Distance Tiebreaker

Within the same priority bin, tiles are sorted by `distance_to_visible`
(Manhattan distance from the tile to the nearest edge of the visible rect).
Closer tiles are rasterized first.

Source: `cc/tiles/tile_priority.h` (`IsHigherPriorityThan`)

### Iteration Order: Spiral From Center

Within each priority region, tiles are visited using
`TilingData::SpiralDifferenceIterator`, which spirals outward from the
visible rect center. This naturally processes viewport-edge tiles before
far-away tiles.

Source: `cc/tiles/tiling_set_raster_queue_all.h`

## Resource Pooling

### ResourcePool

The `ResourcePool` manages GPU resources (SharedImages) for tiles. Key
behaviors:

**Acquisition:** When a tile needs a resource, `AcquireResource()` first
searches for a recycled resource matching the size, format, and color space.
If none exists, a new SharedImage is created.

**Non-exact reuse:** Resources can be reused even if the size doesn't
exactly match, as long as the recycled resource's area is within 2x of the
requested area (`kReuseThreshold = 2.0f`).

**Expiration:** Unused resources expire after 5 seconds
(`kDefaultExpirationDelay`). A background task periodically sweeps and
releases expired resources.

**No atlas:** Each resource is an individual GPU texture. There is no
texture atlas or packing.

Source: `cc/resources/resource_pool.cc`, `cc/resources/resource_pool.h`

### Idle Cleanup

After frames stop being produced:

- `ScheduleReduceTileMemoryWhenIdle()` — after 5 minutes, evicts all tiles
  below NOW priority
- `TrimPrepaintTiles()` — evicts EVENTUALLY-bin tiles that haven't been used
  recently

Source: `cc/tiles/tile_manager.cc`
