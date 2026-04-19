---
title: "Chromium Compositor Research"
tags:
  - internal
  - research
  - chromium
  - rendering
  - compositing
---

# Chromium Compositor Research

Research findings from reading the Chromium source code (`chromium/cc/`,
`chromium/components/viz/`, `chromium/third_party/blink/`). Focused on the
compositing, tiling, rasterization, and GPU rendering architecture.

These documents describe Chromium's mechanisms as-is, for use as reference
material when designing rendering systems that face similar problems.

## Documents

| Document                                                                               | Scope                                                                                               |
| -------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| [glossary.md](./glossary.md)                                                           | Key terms and concepts                                                                              |
| [compositor-architecture.md](./compositor-architecture.md)                             | Overall compositor pipeline                                                                         |
| [property-trees.md](./property-trees.md)                                               | Property trees: transform, effect, clip, scroll data structures                                     |
| [render-surfaces.md](./render-surfaces.md)                                             | Render surfaces, effect isolation, blend modes, backdrop filters                                    |
| [damage-tracking.md](./damage-tracking.md)                                             | Per-surface damage computation, filter expansion, render pass skipping                              |
| [paint-recording.md](./paint-recording.md)                                             | DisplayItemList, PaintOp buffer, R-tree spatial index, RasterSource                                 |
| [tiling-and-rasterization.md](./tiling-and-rasterization.md)                           | Tile grid, rasterization pipeline, GPU raster                                                       |
| [tiling-deep-dive.md](./tiling-deep-dive.md)                                           | Tiling source deep dive: sizing, drawing, invalidation, memory                                      |
| [memory-and-priority.md](./memory-and-priority.md)                                     | Memory budgets, tile priority, eviction                                                             |
| [scheduler.md](./scheduler.md)                                                         | Frame scheduling, deadline modes, state machine, draw throttling                                    |
| [interaction-and-quality.md](./interaction-and-quality.md)                             | Scroll/zoom behavior, checkerboarding, LOD during interaction                                       |
| [resolution-scaling-during-interaction.md](./resolution-scaling-during-interaction.md) | Source-level: pinch-zoom raster scale, stale-tile reuse, CoverageIterator                           |
| [pinch-zoom-deep-dive.md](./pinch-zoom-deep-dive.md)                                   | Pinch-zoom: GPU tile stretching, anchor point, settle/refine, data flow                             |
| [effect-optimizations.md](./effect-optimizations.md)                                   | Effect optimization: filter demotion, render pass bypass, damage tracking                           |
| [node-data-layout.md](./node-data-layout.md)                                           | Node data layout: DOM RareData, compositor property trees, ECS comparison                           |
| [svg-pattern.md](./svg-pattern.md)                                                     | SVG `<pattern>` paint server semantics, Chromium/resvg/Skia comparison                              |
| [blink-rendering-pipeline.md](./blink-rendering-pipeline.md)                           | Blink Style → Layout → Paint pipeline, ComputedStyle groups, LayoutNG, inline layout, list markers  |
| [external-resource-loading.md](./external-resource-loading.md)                         | Resource fetch lifecycle, ImageResource observer pattern, CSS background-image/img loading pipeline |
| [dirty-flag-management.md](./dirty-flag-management.md)                                 | Dirty-flag families across Blink + cc, categorized by type and by invalidation shape/granularity    |

## Source locations

All findings are from the `cc/` (compositor), `components/viz/` (display
compositor), and `third_party/blink/renderer/` (rendering engine) directories
of the Chromium source tree.
