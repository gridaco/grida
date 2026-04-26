---
title: "Chromium SVG Migration Status"
tags:
  - internal
  - research
  - chromium
  - rendering
  - svg
---

# Chromium SVG Migration Status

A snapshot of which Blink rendering systems SVG participates in fully, which
have been migrated, and which are stable in their current form. As of mid-2026
on the main Chromium branch.

## Layout: LayoutNG migration

| Subsystem                                                      | Status                                            | Notes                                                                                                                                                                                                        |
| -------------------------------------------------------------- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| HTML legacy box layout                                         | **Removed** (~2022)                               | All HTML on LayoutNG. The "legacy box tree" no longer exists.                                                                                                                                                |
| SVG `<text>`, `<tspan>`, `<textPath>`                          | **LayoutNG**                                      | `LayoutSVGText` extends `LayoutSVGBlock` extends `LayoutBlockFlow`. Header at `core/layout/svg/layout_svg_text.h:13` literally says "the LayoutNG representation of SVG `<text>`." See [text.md](./text.md). |
| SVG `<foreignObject>`                                          | **LayoutNG**                                      | `LayoutSVGForeignObject` extends `LayoutSVGBlock` extends `LayoutBlockFlow`. HTML descendants get full LayoutNG. See [use-and-foreign-object.md](./use-and-foreign-object.md).                               |
| SVG shapes (`<path>`, `<circle>`, `<rect>`, ...)               | **SVG-specific** (`UpdateSVGLayout`)              | No public roadmap to migrate.                                                                                                                                                                                |
| SVG containers (`<g>`, viewport containers)                    | **SVG-specific**                                  | No public roadmap to migrate.                                                                                                                                                                                |
| SVG resources (`<defs>`, `<linearGradient>`, `<pattern>`, ...) | **SVG-specific**                                  | No public roadmap to migrate.                                                                                                                                                                                |
| SVG `<image>`                                                  | **SVG-specific** (extends `LayoutSVGModelObject`) | No public roadmap to migrate.                                                                                                                                                                                |

The position is that LayoutNG's constraint-space algorithm is designed for
CSS box layout, and SVG's attribute-driven, transform-baked-in geometry
doesn't benefit from migration. Text and `<foreignObject>` migrated because
they reuse complex inline / block-flow logic that's hard to duplicate.

## Paint: BlinkGenPropertyTrees / CompositeAfterPaint

| Subsystem                                                                              | Status               |
| -------------------------------------------------------------------------------------- | -------------------- |
| Property trees built by Blink (PrePaint)                                               | **Complete** (~2020) |
| SVG transforms participate in `TransformPaintPropertyNode`                             | ✓                    |
| SVG `clip-path` participates in `ClipPaintPropertyNode`                                | ✓                    |
| SVG `mask`, `filter`, `opacity` participate in `EffectPaintPropertyNode`               | ✓                    |
| `viewBox` → viewport mapping on `LayoutSVGRoot` becomes a `TransformPaintPropertyNode` | ✓                    |

The "CompositeAfterPaint" architecture is fully on for SVG. SVG paint
records and property trees flow through the same commit path as HTML.
See [`../property-trees.md`](../property-trees.md).

## Animations

| Subsystem                                            | Status                                                                  |
| ---------------------------------------------------- | ----------------------------------------------------------------------- |
| CSS animations on SVG                                | **Stable** — uses standard `core/animation/`                            |
| Web Animations API on SVG                            | **Stable** — same engine                                                |
| SMIL deprecation                                     | **Reverted** (~2016)                                                    |
| SMIL maintenance                                     | **Active** — `core/svg/animation/` receives ongoing fixes               |
| Compositor-thread animation on SVG transform/opacity | **Supported** but uncommon (most SVG content lacks its own `cc::Layer`) |

In 2015 Google announced an intent to remove SMIL in favor of CSS / Web
Animations. The deprecation was suspended in 2016 because too much content
depended on SMIL (no shipping replacement covered sync-base timing and
non-CSS attributes like `points`, `d`, `viewBox`). SMIL remains supported
indefinitely. See [animation-and-smil.md](./animation-and-smil.md).

## Skia integration

| Subsystem                                 | Status                                                                                                              |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Path rasterization via Skia               | **Stable** — `cc::PaintRecord` → `SkCanvas` → Skia GPU/CPU backend                                                  |
| Skia GPU backend                          | **Mixed** — Ganesh (legacy GL/Vk/Metal) and Graphite (newer Vk/Metal/Dawn) coexist; Graphite is opt-in per platform |
| Skia's own `modules/svg/` (SkSVGDOM)      | **Unused** by Blink — Blink has its own complete SVG implementation                                                 |
| Skia's `modules/skottie/` (Lottie player) | **Used** by `cc::PaintSkottie` for browser UI animations only — _not_ for web SVG content                           |

Blink does not consume Skia's SVG module. SkSVG is a standalone renderer
designed for embedders who need to display an SVG without browser
machinery; it cannot integrate with Blink's DOM, CSS, animations, JS
bindings, accessibility, or hit-testing.

## DOM and bindings

| Subsystem                                      | Status                                      |
| ---------------------------------------------- | ------------------------------------------- |
| `SVGAnimatedProperty<T>` (`baseVal`/`animVal`) | **Stable**                                  |
| Tear-off types (`SVGLengthTearOff`, etc.)      | **Stable**                                  |
| Shadow DOM for `<use>`                         | **Stable** (closed shadow root, UA-managed) |
| `<foreignObject>` HTML descendants             | **Stable** — use full Blink HTML pipeline   |

See [animated-properties-idl.md](./animated-properties-idl.md) for the
`SVGAnimatedProperty` and tear-off mechanisms in detail.

## Hit-testing and accessibility

| Subsystem                                                                    | Status                                                                                                                                  |
| ---------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| SVG hit-test (path-based)                                                    | **Stable** — see [hit-testing.md](./hit-testing.md)                                                                                     |
| `pointer-events` SVG-specific values (`bounding-box`, `visiblePainted`, ...) | **Stable**                                                                                                                              |
| AX tree integration                                                          | **Stable** — uses standard `AXNodeObject` with SVG branches; no dedicated `AXSVG*` classes — see [accessibility.md](./accessibility.md) |

## In-flight work

These are areas of active development worth tracking:

- **Skia Graphite rollout.** Default GPU backend transition from Ganesh to
  Graphite, per platform. SVG rendering output is unchanged but the
  underlying Skia GPU pipeline may differ.
- **`<filter>` performance.** Filter rendering forces offscreen
  rasterization and a separate `EffectPaintPropertyNode`. No published
  initiative to fast-path simple filters on the compositor.
- **CSS `d` property.** The `d` attribute as a CSS property (animatable via
  `@keyframes`) is supported; cross-engine consistency continues to evolve.

## Recently completed

- LayoutNG migration for SVG `<text>` (multi-year project, completed pre-2024).
- `<foreignObject>` LayoutNG migration (same window).
- CompositeAfterPaint migration for SVG (~2020), folding SVG into the
  unified property-tree architecture.

## See also

- [pipeline.md](./pipeline.md) — current pipeline reflecting all completed
  migrations.
- [`../blink-rendering-pipeline.md`](../blink-rendering-pipeline.md) — HTML
  side, including LayoutNG status.
- [`../property-trees.md`](../property-trees.md) — the
  CompositeAfterPaint property-tree architecture SVG fully uses.
