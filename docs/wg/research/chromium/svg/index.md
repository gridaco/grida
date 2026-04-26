---
title: "Chromium SVG Rendering Research"
tags:
  - internal
  - research
  - chromium
  - rendering
  - svg
---

# Chromium SVG Rendering Research

How Blink (Chromium's rendering engine) renders SVG. These documents describe
the end-to-end pipeline — DOM construction, layout, paint, and compositing —
as it applies to SVG content, both inline and as a standalone image format.

SVG is part of HTML. An `<svg>` element can be the root of a document, embedded
inline inside an HTML page, or loaded as an image. Blink handles all three
cases by wiring SVG into the same Style → Layout → Paint → Composite pipeline
that drives HTML, with an additional "SVG local coordinate space" layer that
lives under `LayoutSVGRoot`.

## Documents

| Document                                                       | Scope                                                                            |
| -------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| [pipeline.md](./pipeline.md)                                   | End-to-end pipeline: DOM → LayoutSVG\* → paint → composite                       |
| [coordinate-systems.md](./coordinate-systems.md)               | viewBox, preserveAspectRatio, CTM, local-to-parent transforms                    |
| [paint-servers.md](./paint-servers.md)                         | Gradients and patterns as shader-producing resources                             |
| [resources-and-effects.md](./resources-and-effects.md)         | `<clipPath>`, `<mask>`, `<filter>`, `<marker>` resolution                        |
| [path-geometry.md](./path-geometry.md)                         | `d=` parsing, `SVGPath` → `SkPath`, stroke properties → Skia                     |
| [text.md](./text.md)                                           | SVG text: two-phase layout, text-on-path, `SvgTextLayoutAlgorithm`               |
| [use-and-foreign-object.md](./use-and-foreign-object.md)       | `<use>` shadow instance tree, `<foreignObject>` HTML-in-SVG bridging             |
| [svg-as-image.md](./svg-as-image.md)                           | Inline vs standalone vs `<img>`-embedded SVG; `SVGImage`, `SVGImageForContainer` |
| [animation-and-smil.md](./animation-and-smil.md)               | SMIL pipeline (sandwich model, sync-base/event timing) and CSS / Web Animations on SVG |
| [animated-properties-idl.md](./animated-properties-idl.md)     | `SVGAnimatedProperty<T>`, `baseVal`/`animVal` slots, tear-offs, lazy attribute sync |
| [hit-testing.md](./hit-testing.md)                             | Path-based hit-testing, `pointer-events` value table, stroke widening, `<use>` retargeting |
| [accessibility.md](./accessibility.md)                         | SVG in the AX tree: role mapping, `<title>`/`<desc>`, ARIA opt-ins                |
| [migration-status.md](./migration-status.md)                   | LayoutNG / CompositeAfterPaint / SMIL status snapshot; what's stable vs in-flight |
| [comparison.md](./comparison.md)                               | Cross-engine comparison: Chromium vs Servo vs resvg                              |

## Pre-existing companion docs

These sit under `docs/wg/research/chromium/` (not this subdirectory):

- [`svg-pattern.md`](../svg-pattern.md) — deep dive on the `<pattern>` paint
  server (pre-dates this folder). [paint-servers.md](./paint-servers.md)
  summarizes and cross-references it.
- [`render-surfaces.md`](../render-surfaces.md) — compositor render-surface
  creation rules (filters, masks, blend modes). Referenced by
  [resources-and-effects.md](./resources-and-effects.md).
- [`paint-recording.md`](../paint-recording.md) — `PaintRecord`, display
  lists, R-tree indexing. SVG painters emit into this same machinery.
- [`blink-rendering-pipeline.md`](../blink-rendering-pipeline.md) — the
  Style → Layout → Paint pipeline for HTML. SVG layers on top of it.

## Source locations

All findings are from the `third_party/blink/renderer/core/` subtree:

- `svg/` — DOM element classes (`SVGElement`, `SVGPathElement`, …).
- `layout/svg/` — layout tree (`LayoutSVGRoot`, `LayoutSVGShape`, …).
- `paint/` — painters (`SVGShapePainter`, `SVGObjectPainter`, …).
- `svg/graphics/filters/` — filter graph builder.
- `svg/graphics/` — `SVGImage`, `SVGImageForContainer`.

Platform-graphics types (`Pattern`, `Gradient`, `Path`, `GraphicsContext`) live
under `third_party/blink/renderer/platform/graphics/`.
