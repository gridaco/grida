---
title: "Chromium SVG Pipeline Overview"
tags:
  - internal
  - research
  - chromium
  - rendering
  - svg
---

# Chromium SVG Pipeline Overview

The end-to-end pipeline for rendering SVG inside Blink. Emphasis on where the
SVG pipeline diverges from HTML.

```
Parsing         Style             Layout                Paint               Composite
───────         ─────             ──────                ─────               ─────────
<svg …>  ──▶   CSS cascade  ──▶  LayoutSVGRoot    ──▶  SVGRootPainter  ──▶ cc::PaintRecord
  │             on SVGElements    │                     │                   │
  │             + presentation    ├── LayoutSVG         ├── SVGContainer    ├── property trees
  │             attributes         ├── Container         ├── Painter         │   (transform/
  │             aliased to CSS    ├── LayoutSVGShape    ├── SVGShape        │    effect/clip)
  │                                ├── LayoutSVGText     ├── Painter         │
  │                                └── …                 └── …               └── RenderSurfaces
  ▼                                 ▲                     ▲                      for filter/mask
SVGElement tree                     │                     │
                        SVG resources resolved         paint servers resolved
                        (clipPath, mask, filter,      via SVGResources::GetClient
                         marker, pattern, gradient)   → shader on PaintFlags
```

## Phases

### 1. Parsing → `SVGElement` tree

Blink's XML/HTML parser constructs a DOM where `<svg>` and its descendants
become concrete `SVGElement` subclasses:

- Structural: `SVGSVGElement`, `SVGGElement`, `SVGDefsElement`, `SVGSymbolElement`
- Shapes: `SVGPathElement`, `SVGRectElement`, `SVGCircleElement`, `SVGEllipseElement`, `SVGLineElement`, `SVGPolygonElement`, `SVGPolylineElement`
- Text: `SVGTextElement`, `SVGTSpanElement`, `SVGTextPathElement`
- Paint servers: `SVGLinearGradientElement`, `SVGRadialGradientElement`, `SVGPatternElement`
- Effects: `SVGClipPathElement`, `SVGMaskElement`, `SVGFilterElement`, `SVGMarkerElement`
- Filter primitives: `SVGFEGaussianBlurElement`, `SVGFEColorMatrixElement`, 20+ more
- Structural refs: `SVGUseElement`, `SVGImageElement`, `SVGForeignObjectElement`

Presentation attributes (`fill="red"`) and typed attributes (`width="100"`) are
stored as `SVGAnimated*` wrappers around a base value and an animated value —
`SVGAnimatedLength`, `SVGAnimatedNumber`, `SVGAnimatedTransformList`, etc.

```cpp
// third_party/blink/renderer/core/svg/svg_animated_length.h
class SVGAnimatedLength : public ScriptWrappable,
                          public SVGAnimatedProperty<SVGLength> {
 public:
  SVGAnimatedLength(SVGElement* context_element,
                    const QualifiedName& attribute_name,
                    SVGLengthMode mode,
                    SVGLength::Initial initial_value,
                    CSSPropertyID css_property_id = CSSPropertyID::kInvalid);
  const CSSValue* CssValue() const final;   // bridges SVG value → CSS cascade
};
```

The `css_property_id` argument is the bridge: SVG presentation attributes that
have a CSS counterpart (`fill`, `stroke`, `opacity`, `font-family`, …) are fed
into the CSS cascade as if they were inline styles. The cascade also accepts
real CSS rules (`rect { fill: red; }`).

### 2. Style → `ComputedStyle`

SVG reuses the HTML style system. `ComputedStyle` is the same type for HTML and
SVG; SVG-specific properties live in `SVGComputedStyle`
(`third_party/blink/renderer/core/style/svg_computed_style.h`), accessed via
`style.SvgStyle()`. Fields include:

- `fill`, `stroke`, `stroke_dasharray`, `fill_rule`, `clip_rule`
- `marker_start`, `marker_mid`, `marker_end`
- `stop_color`, `stop_opacity`, `flood_color`, `flood_opacity`
- `paint_order` (for controlling fill/stroke/marker order)

The style cascade runs the same way as for HTML. The only SVG-specific step is
that presentation attributes are parsed as CSS values before entering the
cascade.

### 3. Layout → `LayoutSVG*` tree

SVG has its own layout tree that grafts into Blink's layout tree at
`LayoutSVGRoot`. `LayoutSVGRoot` extends `LayoutReplaced` (a CSS-sized replaced
element), and everything below it is SVG-native.

```
LayoutObject
├── LayoutSVGRoot                  extends LayoutReplaced; CSS box ↔ SVG viewport
│   └── (SVG subtree below)
├── LayoutSVGModelObject           abstract base for SVG content
│   ├── LayoutSVGContainer         <g>, <symbol> — groups children
│   │   ├── LayoutSVGTransformableContainer  <g transform=…>
│   │   ├── LayoutSVGViewportContainer       nested <svg>
│   │   ├── LayoutSVGHiddenContainer         <defs>, <clipPath>, <mask>, <filter>, <marker>
│   │   │   └── LayoutSVGResourceContainer   base for all resource containers
│   │   │       ├── LayoutSVGResourcePaintServer    abstract
│   │   │       │   ├── LayoutSVGResourcePattern
│   │   │       │   └── LayoutSVGResourceGradient   (linear + radial concrete)
│   │   │       ├── LayoutSVGResourceClipper
│   │   │       ├── LayoutSVGResourceMasker
│   │   │       ├── LayoutSVGResourceFilter
│   │   │       └── LayoutSVGResourceMarker
│   │   └── …
│   ├── LayoutSVGShape             <path>, <rect>, <circle>, <ellipse>, <line>, <polygon>, <polyline>
│   │   └── LayoutSVGPath          specialization where path can be complex
│   ├── LayoutSVGImage             <image>
│   └── LayoutSVGForeignObject     <foreignObject> — bridges back to HTML layout
└── LayoutSVGText                  <text> — extends LayoutSVGBlock (reuses LayoutNG inline layout)
    └── LayoutSVGInline            <tspan>, <textPath>
        └── LayoutSVGInlineText    text runs
```

Unlike HTML layout (which produces rectangular fragments), SVG layout produces
**paths and bounding boxes in the element's local coordinate system**, plus a
**transform to the parent SVG coordinate system**
(`LocalToSVGParentTransform()`). The tree is then walked during paint with
these transforms composed.

Source: `third_party/blink/renderer/core/layout/svg/layout_svg_model_object.h`
and sibling files.

### 4. Paint → `PaintRecord`

Each `LayoutSVG*` object has a matching painter:

| Layout class                        | Painter                   |
| ----------------------------------- | ------------------------- |
| `LayoutSVGRoot`                     | `SVGRootPainter`          |
| `LayoutSVGContainer` (+ subclasses) | `SVGContainerPainter`     |
| `LayoutSVGShape`                    | `SVGShapePainter`         |
| `LayoutSVGImage`                    | `SVGImagePainter`         |
| `LayoutSVGForeignObject`            | `SVGForeignObjectPainter` |
| `LayoutSVGText`                     | `SVGTextPainter`          |

All painters emit into the same `PaintRecord` (display list) machinery used by
HTML — see [`paint-recording.md`](../paint-recording.md). A painter:

1. Checks paint phase (only `kForeground` for most SVG content).
2. Runs `ScopedSVGTransformState` — concats this element's
   `LocalSVGTransform()` onto the `GraphicsContext` CTM.
3. Runs `ScopedSVGPaintState` — prepares fill/stroke `cc::PaintFlags`,
   applying paint servers (shaders), clip paths, masks, filters.
4. Records `DrawPath` / `DrawRect` / text ops into the `PaintRecord`.

Paint order inside a shape respects the `paint-order` CSS property; default is
`fill, stroke, markers`.

```cpp
// third_party/blink/renderer/core/paint/svg_shape_painter.cc
void SVGShapePainter::Paint(const PaintInfo& paint_info) {
  if (paint_info.phase != PaintPhase::kForeground ||
      layout_svg_shape_.IsShapeEmpty())
    return;

  // cull-rect skip
  if (SVGModelObjectPainter::CanUseCullRect(layout_svg_shape_.StyleRef())) {
    if (!paint_info.GetCullRect().IntersectsTransformed(
            layout_svg_shape_.LocalSVGTransform(),
            layout_svg_shape_.VisualRectInLocalSVGCoordinates()))
      return;
  }

  ScopedSVGTransformState transform_state(paint_info, layout_svg_shape_);
  ScopedSVGPaintState paint_state(layout_svg_shape_, …);
  if (!DrawingRecorder::UseCachedDrawingIfPossible(…)) {
    SVGDrawingRecorder recorder(…);
    PaintShape(content_paint_info);   // fill → stroke → markers
  }
}
```

### 5. Composite → cc property trees

Once `PaintRecord`s exist, Blink hands them to the compositor (`cc/`). SVG
content participates in the same property trees (transform / effect / clip /
scroll) as HTML. SVG-specific wrinkles:

- Most SVG transforms are **baked into the `PaintRecord`** via
  `canvas->concat(local_transform)` rather than as a compositor transform
  node. Compositor transforms are reserved for elements that opt into
  compositing (e.g., an animated `<svg>` root, or an ancestor with
  `will-change: transform`).
- `<filter>`, `<mask>`, and explicit blend modes can force a **render
  surface** (offscreen buffer). See
  [render-surfaces.md](../render-surfaces.md).
- Paint servers (pattern, gradient) **never** create compositor layers —
  they are always resolved as shaders at paint time.
  See [svg-pattern.md](../svg-pattern.md) for the pattern case.

## How SVG diverges from HTML

| Aspect              | HTML                                           | SVG                                                                                                         |
| ------------------- | ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Layout tree root    | `LayoutView`                                   | `LayoutSVGRoot` (attached under HTML `LayoutView` like any replaced element)                                |
| Layout result       | Rectangular fragments (`PhysicalFragment`)     | Local paths + bounding boxes + `LocalToSVGParentTransform()`                                                |
| Coordinate system   | CSS pixels, one per element box                | Arbitrary user units; `<svg viewBox>` establishes a new coordinate space; nested `<svg>` nest viewports     |
| Transform ownership | Compositor transform tree                      | Baked into `PaintRecord` by default; compositor only for promoted layers                                    |
| Paint order         | Stacking contexts (CSS §9.9)                   | Document order within a group; `paint-order` controls fill/stroke/marker within a shape                     |
| Text layout         | LayoutNG inline flow                           | LayoutNG inline flow **followed by** `SvgTextLayoutAlgorithm` that rewrites per-glyph positions             |
| Resource resolution | URL → resource loader (for `background-image`) | `url(#id)` → same-document `SVGElementResourceClient` lookup; resolved at **paint time**, cached per-client |
| Replaced elements   | `<img>`, `<video>`, iframes                    | `<foreignObject>` (HTML inside SVG); `<image>` (raster image in SVG); `<use>` (subtree clone)               |
| Hit testing         | Box-based                                      | Path-based for shapes; `pointer-events` decides fill-vs-stroke-vs-both                                      |

## Source files

| File                                                                         | Role                                                                  |
| ---------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `third_party/blink/renderer/core/svg/svg_element.h`                          | Base `SVGElement` class, CTM scope enum                               |
| `third_party/blink/renderer/core/svg/svg_animated_length.h`                  | Typed animated attribute wrapper; CSS bridge                          |
| `third_party/blink/renderer/core/style/svg_computed_style.h`                 | SVG-specific `ComputedStyle` fields (fill, stroke, markers, …)        |
| `third_party/blink/renderer/core/layout/svg/layout_svg_root.h`               | Outer `<svg>` — bridges CSS replaced-element layout to SVG coords     |
| `third_party/blink/renderer/core/layout/svg/layout_svg_model_object.h`       | Abstract base for all SVG layout objects                              |
| `third_party/blink/renderer/core/layout/svg/layout_svg_shape.h`              | Geometry shapes; owns `Path` cache                                    |
| `third_party/blink/renderer/core/layout/svg/layout_svg_container.h`          | `<g>` / container hierarchy                                           |
| `third_party/blink/renderer/core/layout/svg/layout_svg_resource_container.h` | Base for all resource containers (hidden from visual tree)            |
| `third_party/blink/renderer/core/layout/svg/svg_resources.h`                 | `SVGResources::GetClient()`, `ReferenceBoxForEffects()`               |
| `third_party/blink/renderer/core/paint/svg_shape_painter.cc`                 | Core shape paint path                                                 |
| `third_party/blink/renderer/core/paint/svg_container_painter.cc`             | Group paint traversal                                                 |
| `third_party/blink/renderer/core/paint/svg_object_painter.h`                 | Shared utilities: paint server application, resource subtree painting |
