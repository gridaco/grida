---
title: "SVG Rendering: Chromium vs Servo vs resvg"
tags:
  - internal
  - research
  - chromium
  - svg
  - servo
  - resvg
---

# SVG Rendering: Chromium vs Servo vs resvg

A cross-engine comparison of how SVG rendering is factored across three
open-source engines. This is the only doc in `svg/` that steps outside
Chromium; the rest describe Chromium as-is.

## Cross-engine factoring

| Concern               | Chromium (Blink)                                                                   | Servo                                                                   | resvg                                                                    |
| --------------------- | ---------------------------------------------------------------------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Parser                | Blink HTML/XML parser; `SVGElement` subclasses                                     | html5ever / xml5ever → `SVG*Element` DOM stubs                          | `roxmltree` → `usvg::Tree` (normalized)                                  |
| Inheritance / cascade | CSS cascade on `ComputedStyle` with SVG-specific fields in `SVGComputedStyle`      | Delegated to resvg (doesn't cascade SVG presentation attributes itself) | usvg resolves inheritance during parse; outputs explicit per-node values |
| `<use>` handling      | Runtime shadow-DOM instantiation; invalidation on target change                    | Delegated                                                               | Deep copy at parse time; independent subtree                             |
| Text                  | Two-phase: LayoutNG inline + `SvgTextLayoutAlgorithm`                              | Delegated                                                               | Shaped (rustybuzz) + flattened to `Path` nodes at parse time             |
| Layout                | `LayoutSVG*` tree; local transforms + bounding boxes                               | Treats `<svg>` as a replaced element; no SVG-specific layout            | No layout — usvg emits pre-resolved absolute transforms and bboxes       |
| Paint backend         | Skia via `cc::PaintRecord` / `cc::PaintFlags`                                      | Via resvg → tiny-skia → WebRender image                                 | tiny-skia (CPU) `Pixmap`                                                 |
| Paint servers         | `LayoutSVGResource*` with per-client shader cache                                  | Delegated                                                               | Top-level pools in `Tree`; rendered per-use                              |
| Filters               | `SVGFilterBuilder` → `FilterEffect` → Skia `PaintFilter`; may be compositor-accel. | Delegated                                                               | Sequential primitive pipeline on CPU                                     |
| Clip / mask           | Path-based (fast) + rasterized fallback                                            | Delegated                                                               | Pixel buffers; apply via tiny-skia `Mask`                                |
| Composite / GPU       | cc property trees + render surfaces; GPU raster                                    | WebRender rasterizes the resvg-produced image                           | None — CPU only                                                          |
| `<foreignObject>`     | Full HTML paint bridge                                                             | Unknown / not supported in practice                                     | Not supported (by design)                                                |
| Animation             | CSS + SMIL                                                                         | Delegated                                                               | Static (by design)                                                       |

### Short version

- **Chromium** implements SVG as a first-class citizen of Blink's pipeline,
  deeply integrated with the compositor, CSS cascade, and GPU raster. It
  pays the integration cost but supports the full spec and animates.
- **Servo** treats SVG as a black box: parse to a DOM just enough for
  scripting, but all rendering decisions are delegated to resvg. Inline
  SVG is serialized to a `data:` URL and shipped through the image cache
  as a rasterized bitmap. No SVG pipeline of its own.
- **resvg** is two crates: **usvg** (normalize everything — inheritance,
  `<use>`, units, text shaping) and **resvg** (draw a normalized tree with
  tiny-skia). Static-only, CPU-only, but comprehensive for the
  features it supports.

## The usvg/resvg split as a design pattern

resvg's README explicitly calls out the split:

> SVG parsing and rendering are two completely separate steps… split into two
> separate libraries: `resvg` and `usvg`. Meaning you can easily write your
> own renderer on top of `usvg` using any 2D library of your liking.

What usvg normalizes away, so the renderer doesn't have to:

- **Inheritance**: every node in the output tree has every presentation
  attribute resolved. No `currentColor` resolution at paint time; no
  "inherit this from my parent."
- **`<use>` expansion**: the target is deep-cloned into the use site.
- **Unit resolution**: em, %, mm, in — all become user units.
- **`objectBoundingBox` gradients**: converted to `userSpaceOnUse`.
- **Basic shape conversion**: `<rect>`, `<circle>`, `<ellipse>`, `<line>`,
  `<polygon>`, `<polyline>` all become `<path>` equivalents.
- **Arcs**: arc-to-cubic decomposition.
- **`<switch>`**: resolved at parse time.
- **Text**: shaped with rustybuzz, decomposed to `Path` nodes (and
  `Image` nodes for color emoji).
- **Bounding boxes and absolute transforms**: pre-computed per node.
- **Paint servers**: pulled into `Tree`-level pools (gradients,
  patterns, clips, masks, filters) and referenced by `Arc`.

The pre-computed bounding boxes are especially important: `Group::abs_bbox`
lets the renderer skip subtrees that don't intersect the dirty area
without any traversal.

Chromium doesn't factor this way. Its `LayoutSVG*` tree is a
**mid-normalized** representation: inheritance is resolved (via
`ComputedStyle`) but `<use>` is a runtime shadow tree and coordinate
resolution happens at paint time. The difference is that Blink needs a
live DOM that JavaScript can mutate; resvg's tree is frozen.

## Text: two strategies

Chromium keeps text **semantic** all the way to paint (one `DrawTextBlob`
per glyph run), which preserves selectability, accessibility, and
animation. But it requires `SvgTextLayoutAlgorithm` — a per-glyph
post-processor.

resvg/usvg **flatten text to paths** at parse time using rustybuzz. The
renderer never sees a `Text` node (it's flattened to `Group` +
`Path` + `Image` for color emoji). Trade-offs:

- **+** Renderer has zero font-handling code.
- **+** Reproducibility: same input → same tree on every platform.
- **+** Works on GPU without a font rasterization library.
- **−** No selection, no accessibility.
- **−** Large file sizes (outlines vs glyph ids).
- **−** Animations that depend on text content (e.g., `<animate>` of a
  `<tspan>` text) don't work.

For Grida's canvas use case — render SVG as-is to Skia — the resvg
approach wins for simplicity. A pure GPU renderer that still needs
selectable text can reach for Skia's `SkTextBlob` (similar to Blink), but
needs to reproduce the SVG per-character positioning algorithm.

## Paint servers: per-client vs per-tree

Chromium: per-client shader cache because `objectBoundingBox` makes the
shader depend on the referencing shape's bounds. The display list (the
tile's pre-rendered commands) could in theory be shared across clients,
but Chromium currently doesn't.

resvg: gradient/pattern definitions live at `Tree` level; the renderer
computes a fresh shader for each use site, but the underlying definition
is shared (via `Arc<Pattern>`). Patterns are rendered to a pixmap per use
site — reasonable on CPU; on GPU, a texture atlas or render-once-reuse-
many strategy would be worth considering.

## Filters: DAG vs sequential

Chromium builds an explicit DAG (`FilterEffect` graph), composes to a
single `PaintFilter`, and can translate to `CompositorFilterOperations`
for GPU execution.

resvg walks the primitives in document order, maintaining a named result
table. No graph compilation — each primitive reads named inputs from the
table and writes to it.

Chromium's composed `PaintFilter` reuses Skia's `SkImageFilter` graph
compiler. resvg walks primitives in document order on CPU.

## Source anchors

- **Chromium SVG**: this research subdirectory
  (`docs/wg/research/chromium/svg/`).
- **Servo SVG stance**:
  `servo/components/layout/replaced.rs` — SVG treated as replaced
  element, serialized to `data:` URL;
  `servo/components/net/image_cache.rs` — invokes
  `resvg::render()` into a tiny-skia pixmap, shipped to WebRender as an
  image;
  `servo/components/script/dom/svg/` — scriptable DOM stubs without a
  native rendering pipeline.
- **resvg architecture**:
  `resvg/crates/usvg/src/tree/` — normalized tree types;
  `resvg/crates/usvg/src/parser/` — inheritance resolution, `<use>`
  expansion, unit resolution;
  `resvg/crates/usvg/src/text/flatten.rs` — rustybuzz shaping + text
  outlining;
  `resvg/crates/resvg/src/render.rs` — tree traversal and layer
  composition;
  `resvg/crates/resvg/src/path.rs` — path, gradient, pattern rendering;
  `resvg/crates/resvg/src/filter/mod.rs` — primitive pipeline;
  `resvg/docs/unsupported.md` — documented non-goals (no animation, no
  scripting, no SVG 1.2 Tiny, no `<foreignObject>`).
