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

| Document                                                   | Scope                                                                                      |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| [pipeline.md](./pipeline.md)                               | End-to-end pipeline: DOM → LayoutSVG\* → paint → composite                                 |
| [coordinate-systems.md](./coordinate-systems.md)           | viewBox, preserveAspectRatio, CTM, local-to-parent transforms                              |
| [paint-servers.md](./paint-servers.md)                     | Gradients and patterns as shader-producing resources                                       |
| [resources-and-effects.md](./resources-and-effects.md)     | `<clipPath>`, `<mask>`, `<filter>`, `<marker>` resolution                                  |
| [path-geometry.md](./path-geometry.md)                     | `d=` parsing, `SVGPath` → `SkPath`, stroke properties → Skia                               |
| [text.md](./text.md)                                       | SVG text: two-phase layout, text-on-path, `SvgTextLayoutAlgorithm`                         |
| [use-and-foreign-object.md](./use-and-foreign-object.md)   | `<use>` shadow instance tree, `<foreignObject>` HTML-in-SVG bridging                       |
| [svg-as-image.md](./svg-as-image.md)                       | Inline vs standalone vs `<img>`-embedded SVG; `SVGImage`, `SVGImageForContainer`           |
| [animation-and-smil.md](./animation-and-smil.md)           | SMIL pipeline (sandwich model, sync-base/event timing) and CSS / Web Animations on SVG     |
| [animated-properties-idl.md](./animated-properties-idl.md) | `SVGAnimatedProperty<T>`, `baseVal`/`animVal` slots, tear-offs, lazy attribute sync        |
| [hit-testing.md](./hit-testing.md)                         | Path-based hit-testing, `pointer-events` value table, stroke widening, `<use>` retargeting |
| [accessibility.md](./accessibility.md)                     | SVG in the AX tree: role mapping, `<title>`/`<desc>`, ARIA opt-ins                         |
| [migration-status.md](./migration-status.md)               | LayoutNG / CompositeAfterPaint / SMIL status snapshot; what's stable vs in-flight          |
| [comparison.md](./comparison.md)                           | Cross-engine comparison: Chromium vs Servo vs resvg                                        |

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

```
third_party/blink/renderer/
├── core/svg/                       SVG DOM, parsing, IDL bindings
│   ├── animation/                  SMIL: SMILTimeContainer, sandwich, SVGSMILElement
│   ├── graphics/                   SVGImage, SVGImageForContainer
│   ├── graphics/filters/           filter graph builder
│   └── properties/                 SVGAnimatedProperty, tear-offs
├── core/layout/svg/                SVG-specific layout (UpdateSVGLayout)
├── core/paint/  (svg_*)            SVG painters (filename prefix svg_)
├── core/animation/                 CSS / Web Animations engine (shared with HTML)
├── core/css/                       CSS engine (shared)
├── core/dom/                       DOM base (shared)
├── modules/accessibility/          AX tree (no separate AXSVG class — folded into AXNodeObject)
└── platform/graphics/              GraphicsContext, Path, Gradient, Pattern (shared)

cc/
├── paint/                          PaintRecord, PaintOp, PaintFlags (the IR shared with Blink)
├── layers/                         cc::Layer hierarchy
├── tiles/                          tiling
├── raster/                         raster scheduling
└── trees/                          LayerTreeHost / Impl

components/viz/                     display compositor (GPU process)

third_party/skia/                   vendored Skia (used by cc raster + Viz)
└── modules/skottie/                used by cc::PaintSkottie — NOT for web SVG
```

Blink does **not** consume Skia's `modules/svg/` (SkSVGDOM). Blink has its
own complete SVG implementation; SkSVG is for embedders that need standalone
SVG rendering without DOM/CSS/JS integration.

## What's shared with HTML

A bird's-eye view of which Blink subsystems treat SVG identically to HTML
and which have SVG-specific paths. "Shared" means the same code runs for
both; "different" means SVG has its own implementation in parallel.

| Subsystem                                   | SVG vs HTML                                                                                                                                                     |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Process / thread model                      | **Same** — main thread for parse/style/layout/paint; cc/Viz unchanged                                                                                           |
| Parser frontend                             | **Same** parser, with SVG-aware namespace handling                                                                                                              |
| DOM base classes                            | **Same** (`Node`, `Element`); `SVGElement` extends `Element` directly                                                                                           |
| Selector matching, cascade, `ComputedStyle` | **Same**; SVG has an `SVGComputedStyle` sub-struct hung off `ComputedStyle` for `fill`/`stroke`/`marker-*`/etc.                                                 |
| `LayoutObject` base                         | **Same**                                                                                                                                                        |
| Layout algorithm                            | **Different** for SVG shapes/containers/resources (`UpdateSVGLayout`); **same** (LayoutNG) for SVG `<text>` and `<foreignObject>`                               |
| Paint property trees (PrePaint)             | **Same**                                                                                                                                                        |
| Painters                                    | **Different** family (`SVG*Painter`); **same** output type (`PaintRecord`)                                                                                      |
| `cc::PaintOpBuffer` IR                      | **Same** — once recorded, "SVG-ness" is gone                                                                                                                    |
| Compositor (`cc/`)                          | **Same** — agnostic to source                                                                                                                                   |
| Viz / display compositor                    | **Same**                                                                                                                                                        |
| Animation engines                           | **Two coexist**: CSS / Web Animations (shared with HTML); SMIL (SVG-only). SMIL takes precedence per spec.                                                      |
| Resource references via `url(#id)`          | **SVG-only** — HTML has no equivalent resource graph                                                                                                            |
| Hit testing                                 | **Different** algorithm (path-based with `pointer-events` rules); **same** dispatch                                                                             |
| Accessibility                               | **Mostly shared** — same `AXNodeObject` machinery, with SVG-aware role mapping                                                                                  |
| As-image rendering                          | **SVG-only** (`SVGImage` + `SVGImageForContainer`)                                                                                                              |
| `requestAnimationFrame` lifecycle           | **Same** — SMIL is sampled by `Page::Animator::ServiceScriptedAnimations` at the top of every `BeginMainFrame`, before rAF callbacks and the document lifecycle |

For more detail per subsystem, see the topical docs above.

## SVG resource invalidation

SVG resources (`<linearGradient>`, `<pattern>`, `<clipPath>`, `<mask>`,
`<filter>`, `<marker>`, `<symbol>`/`<use>`-targets) form a directed graph
of (client → resource) back-edges keyed by `url(#id)` references. When a
resource changes, it walks its client set and propagates an invalidation
mask telling each client what kind of work to redo.

### The mask flags

```cpp
// third_party/blink/renderer/core/layout/svg/layout_svg_resource_container.h
enum InvalidationMode {
  kLayoutInvalidation          = 1 << 0,
  kBoundariesInvalidation      = 1 << 1,
  kPaintInvalidation           = 1 << 2,
  kPaintPropertiesInvalidation = 1 << 3,
  kClipCacheInvalidation       = 1 << 4,
  kFilterCacheInvalidation     = 1 << 5,
  kInvalidateAll = /* all of the above */,
};
void MarkAllClientsForInvalidation(InvalidationModeMask);
```

### Per-resource type

| Resource                                            | Mask propagated to clients on change                                                 |
| --------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `<linearGradient>`, `<radialGradient>`, `<pattern>` | `kPaintInvalidation` (recompute SkShader, re-record paint ops)                       |
| `<clipPath>`                                        | `kClipCacheInvalidation \| kPaintInvalidation`                                       |
| `<mask>`                                            | `kPaintPropertiesInvalidation \| kPaintInvalidation`                                 |
| `<filter>`                                          | `kPaintPropertiesInvalidation \| kPaintInvalidation \| kFilterCacheInvalidation`     |
| `<marker>`                                          | `kLayoutInvalidation \| kBoundariesInvalidation` (markers contribute to stroke bbox) |
| `<symbol>` / `<use>` target                         | shadow-tree rebuild + full invalidation (`InvalidateInstances`)                      |

The realized objects (gradient/pattern `SkShader`, filter `cc::PaintFilter`,
clip `Path`) are cached on the resource container and discarded based on
the corresponding flag. Caches are keyed per-client because
`*Units="objectBoundingBox"` makes the realized form bbox-dependent.

### Trace of a single mutation

For `element.setAttribute('r', '50')` on a `<circle>`:

```
Element::AttributeChanged
  └── SVGElement::AttributeChanged
        └── SVGAnimatedNumber::AttributeChanged          // parses '50' into baseVal
              └── SVGElement::SvgAttributeChanged({ property=r, … })
                    └── LayoutSVGShape::SetNeedsShapeUpdate + SetNeedsLayout
                          └── MarkForLayoutAndParentResourceInvalidation
                                ├── ancestors marked NeedsLayout (bbox propagates up)
                                └── if element is referenced by url(#id):
                                      → resource clients notified per their mask

next BeginMainFrame:
  ServiceAnimations / ServiceSmil  (no-op for plain setAttribute)
  Style recalc                    (no-op; r is geometry-only)
  Layout                          LayoutSVGShape::UpdateSVGLayout
                                    rebuilds SkPath, recomputes object/stroke bbox
                                    propagates SVGLayoutResult{bounds_changed=true}
  PrePaint                        paint property nodes possibly updated
  Paint                           PaintController re-records this LayoutObject's items;
                                  DisplayItemCache reuses items for unchanged siblings
  Commit                          → cc → raster → Viz → present
```

For an animated value (SMIL or Web Animations), the sample writes into
`animVal` instead of baseVal (see
[animated-properties-idl.md](./animated-properties-idl.md)) but the
downstream invalidation path is the same.

See also [`../dirty-flag-management.md`](../dirty-flag-management.md) for
the cross-Blink invalidation taxonomy.

## Glossary

Cross-cutting terms whose colloquial meanings often clash with how they're
used in the Blink/Chromium codebase. The parent
[`../glossary.md`](../glossary.md) covers compositor (`cc/viz`) terms;
this glossary covers SVG-side and rendering-pipeline-wide terms.

| Term                          | What it means here                                                                                                                                                                   |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **"Renderer" (process)**      | The OS process hosting Blink. Named historically — does **not** mean pixel rendering. Actual rasterization happens in cc raster workers and Viz.                                     |
| **"Rendering" (verb)**        | Standards: producing pixels. Blink-internal: usually the whole pipeline. Disambiguate by context.                                                                                    |
| **"Layout" (in SVG context)** | Geometry resolution — paths, transforms, bounding boxes. Not "where boxes go." HTML layout is box flow; SVG layout is `UpdateSVGLayout`.                                             |
| **"Paint"**                   | Recording `PaintOp`s into a `PaintRecord`. **Does not** produce pixels. Only cc raster + Skia produce pixels.                                                                        |
| **"Composite"**               | Overloaded. Blogs: any post-Layout work. cc: layer + tile + raster + draw. Viz: cross-renderer aggregation. Always disambiguate.                                                     |
| **"Render tree"**             | Deprecated WebKit term for the layout tree. Don't use; say "layout tree" or "`LayoutObject` tree."                                                                                   |
| **`PaintLayer`**              | Blink concept for stacking-context grouping during paint. **Not** a `cc::Layer`.                                                                                                     |
| **`cc::Layer`**               | The compositor's atom of compositing. Often (but not always) corresponds to a `PaintLayer`.                                                                                          |
| **"Composited" (an element)** | Has its own `cc::Layer` that can be transformed/animated without re-paint.                                                                                                           |
| **`baseVal` / `animVal`**     | SVG IDL surface for the declared vs. currently-animated value of an animatable attribute. Rendering reads `animVal`. See [animated-properties-idl.md](./animated-properties-idl.md). |
| **"Sandwich"**                | SMIL's per-`(element, attribute)` priority stack of currently-active animations. See [animation-and-smil.md](./animation-and-smil.md).                                               |
| **"Tear-off"**                | JS-exposed wrapper around an internal SVG value (`SVGLengthTearOff`, `SVGTransformTearOff`, …) that holds a back-pointer to its owning element so mutations propagate.               |
| **`<defs>`**                  | A hidden SVG container for resources (`LayoutSVGHiddenContainer`). Children participate in style/layout but not paint.                                                               |
| **Presentation attribute**    | An SVG attribute that aliases to a CSS property (`fill="red"` ↔ `fill: red`). Folded into the cascade at low specificity.                                                            |
| **`objectBoundingBox` units** | Resource-coordinate mode where `[0, 1]²` maps to the referencing element's bounding box, not user space. Affects gradients, patterns, clipPaths, masks, filters.                     |
