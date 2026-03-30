---
title: "SVG Import Mapping"
format: md
tags:
  - internal
  - wg
  - format
  - svg
---

# SVG Import Mapping

SVG → Grida IR property mapping and TODO tracker.

**Implementation:** `crates/grida-canvas/src/svg/` (uses [usvg](https://github.com/nicbeuc/resvg) for pre-processing).

usvg simplifies the SVG DOM before we see it: `<use>` is resolved, CSS is computed, `<defs>` are inlined, transforms are flattened. Our mapping is from the usvg simplified tree, not raw SVG.

## Elements

| SVG Element                                                            | usvg Type            | Grida IR Node            | Status | Notes                                   |
| ---------------------------------------------------------------------- | -------------------- | ------------------------ | ------ | --------------------------------------- |
| `<svg>`                                                                | `Tree` (root)        | Scene + InitialContainer | ✅     | viewBox → scene size                    |
| `<g>`                                                                  | `Group`              | GroupNodeRec             | ✅     | blend_mode, opacity, clip               |
| `<rect>`, `<circle>`, `<ellipse>`, `<line>`, `<polyline>`, `<polygon>` | `Path`               | PathNodeRec              | ✅     | usvg pre-converts shapes to paths       |
| `<path>`                                                               | `Path`               | PathNodeRec              | ✅     | Fill + stroke + transform               |
| `<image>`                                                              | `Image`              | ImageNodeRec             | ✅     | Embedded raster data                    |
| `<text>`                                                               | `Text` → `TextChunk` | TextSpanNodeRec          | ⚠️     | Single-style spans; mixed-style partial |
| `<clipPath>`                                                           | Group clip           | GroupNodeRec.clip        | ⚠️     | Basic rectangular clips                 |
| `<mask>`                                                               | Mask                 | LayerMaskType            | ✅     | Luminance + Alpha                       |
| `<filter>`                                                             | --                   | LayerEffects             | ⚠️     | Not fully mapped from usvg              |
| `<marker>`                                                             | --                   | --                       | ❌     | Not mapped                              |
| `<pattern>`                                                            | --                   | --                       | ❌     | No pattern fill IR                      |
| `<symbol>`                                                             | (resolved by usvg)   | --                       | ✅     | Transparent — usvg inlines              |
| `<use>`                                                                | (resolved by usvg)   | --                       | ✅     | Transparent — usvg inlines              |
| `<defs>`                                                               | (resolved by usvg)   | --                       | ✅     | Transparent — usvg inlines              |
| `<foreignObject>`                                                      | --                   | --                       | ❌     | Not supported                           |
| `<switch>`                                                             | --                   | --                       | ❌     | Not supported                           |
| SMIL animations                                                        | --                   | --                       | 🚫     | Out of scope (static import)            |

## Paint

| SVG Feature                     | usvg Type                         | Grida IR                      | Status | Notes              |
| ------------------------------- | --------------------------------- | ----------------------------- | ------ | ------------------ |
| Solid fill color                | `Paint::Color`                    | `Paint::Solid`                | ✅     |                    |
| Fill opacity                    | `Fill.opacity`                    | paint alpha                   | ✅     |                    |
| Fill rule                       | `FillRule`                        | `FillRule` (NonZero, EvenOdd) | ✅     |                    |
| Linear gradient                 | `Paint::LinearGradient`           | `Paint::LinearGradient`       | ✅     |                    |
| Radial gradient                 | `Paint::RadialGradient`           | `Paint::RadialGradient`       | ✅     |                    |
| Gradient stops                  | `Stop { offset, color, opacity }` | `GradientColorStop`           | ✅     |                    |
| `spreadMethod` (pad)            | --                                | --                            | ✅     | Default            |
| `spreadMethod` (reflect/repeat) | --                                | --                            | ❌     | Only pad supported |
| Pattern fill                    | `Paint::Pattern`                  | --                            | ❌     | No IR equivalent   |

## Stroke

| SVG Attribute       | Grida IR Field                                | Status |
| ------------------- | --------------------------------------------- | ------ | ---------- |
| `stroke-width`      | `StrokeWidth::Uniform`                        | ✅     |
| `stroke-linecap`    | `StrokeCap` (Butt, Round, Square)             | ✅     |
| `stroke-linejoin`   | `StrokeJoin` (Miter, MiterClip, Round, Bevel) | ✅     |
| `stroke-miterlimit` | `StrokeMiterLimit`                            | ✅     |
| `stroke-dasharray`  | `StrokeDashArray`                             | ✅     |
| `stroke-dashoffset` | --                                            | ❌     | Not mapped |
| `stroke-opacity`    | paint alpha                                   | ✅     |

## Transform

| SVG Feature             | Grida IR          | Status | Notes                           |
| ----------------------- | ----------------- | ------ | ------------------------------- |
| `transform` (2D affine) | `AffineTransform` | ✅     | usvg resolves nested transforms |
| 3D transforms           | --                | ❌     | 2D only                         |

## Effects

| SVG Feature               | Grida IR             | Status | Notes                                  |
| ------------------------- | -------------------- | ------ | -------------------------------------- |
| `opacity` (group/element) | `node.opacity`       | ✅     |                                        |
| Blend modes (all 16)      | `LayerBlendMode`     | ✅     | Full mapping                           |
| `<feGaussianBlur>`        | `FeLayerBlur`        | ⚠️     | Not fully wired from usvg filter chain |
| `<feDropShadow>`          | `FilterShadowEffect` | ⚠️     | Not fully wired                        |
| `<feColorMatrix>`         | --                   | ❌     | No IR equivalent                       |
| `<feComposite>`           | --                   | ❌     | No IR equivalent                       |
| `<feMorphology>`          | --                   | ❌     | No IR equivalent                       |
| `<feTurbulence>`          | `FeNoiseEffect`      | ⚠️     | IR exists, mapping incomplete          |

## Text

| SVG Feature             | Grida IR                         | Status | Notes                                             |
| ----------------------- | -------------------------------- | ------ | ------------------------------------------------- |
| `<text>` content        | `TextSpanNodeRec.text`           | ✅     |                                                   |
| `font-family`           | `TextStyleRec.font_family`       | ✅     |                                                   |
| `font-size`             | `TextStyleRec.font_size`         | ✅     |                                                   |
| `font-weight`           | `TextStyleRec.font_weight`       | ✅     |                                                   |
| `font-style`            | `TextStyleRec.font_style_italic` | ✅     |                                                   |
| `text-anchor`           | `SVGTextAnchor`                  | ✅     | Start, Middle, End                                |
| `fill` on text          | `TextSpanNodeRec.fills`          | ✅     |                                                   |
| `<textPath>`            | --                               | ❌     | Text on path not supported                        |
| Multi-span mixed styles | --                               | ⚠️     | Partial; each `<tspan>` becomes separate TextSpan |
| `dominant-baseline`     | --                               | ❌     | No baseline offset IR                             |
| `letter-spacing`        | `TextLetterSpacing`              | ⚠️     | May not be mapped from usvg                       |
| `word-spacing`          | `TextWordSpacing`                | ⚠️     | May not be mapped from usvg                       |

## IR Gaps (SVG features blocked by missing IR)

1. **Pattern fills** -- `<pattern>` has no IR equivalent
2. **SVG filter primitives** -- feColorMatrix, feComposite, feMorphology, etc.
3. **Gradient spread modes** -- reflect/repeat not supported
4. **Text on path** -- `<textPath>` needs path-follow layout
5. **Stroke dash offset** -- `stroke-dashoffset` not in `StrokeStyle`
