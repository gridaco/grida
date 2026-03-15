---
title: "Chromium Compositor Research"
---

# Chromium Compositor Research

Research findings from reading the Chromium source code (`chromium/cc/`,
`chromium/components/viz/`, `chromium/third_party/blink/`). Focused on the
compositing, tiling, rasterization, and GPU rendering architecture.

These documents describe Chromium's mechanisms as-is, for use as reference
material when designing rendering systems that face similar problems.

## Documents

| Document                                                     | Scope                                                            |
| ------------------------------------------------------------ | ---------------------------------------------------------------- |
| [glossary.md](./glossary.md)                                 | Key terms and concepts                                           |
| [compositor-architecture.md](./compositor-architecture.md)   | Overall compositor pipeline                                      |
| [render-surfaces.md](./render-surfaces.md)                   | Render surfaces, effect isolation, blend modes, backdrop filters |
| [tiling-and-rasterization.md](./tiling-and-rasterization.md) | Tile grid, rasterization pipeline, GPU raster                    |
| [memory-and-priority.md](./memory-and-priority.md)           | Memory budgets, tile priority, eviction                          |
| [interaction-and-quality.md](./interaction-and-quality.md)   | Scroll/zoom behavior, checkerboarding, LOD during interaction    |

## Source locations

All findings are from the `cc/` (compositor), `components/viz/` (display
compositor), and `third_party/blink/renderer/` (rendering engine) directories
of the Chromium source tree.
