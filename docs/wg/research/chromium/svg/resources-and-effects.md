---
title: "Chromium SVG Resources and Effects"
tags:
  - internal
  - research
  - chromium
  - rendering
  - svg
---

# Chromium SVG Resources and Effects

`<clipPath>`, `<mask>`, `<filter>`, `<marker>` — the four non-paint-server
resource types. Each is a `<defs>`-style element that contributes to the
visual output of _another_ element that references it by `url(#id)`.

Paint servers (`<pattern>`, `<linearGradient>`, `<radialGradient>`) are
covered in [paint-servers.md](./paint-servers.md).

## Shared infrastructure

All four resources extend `LayoutSVGResourceContainer`, which extends
`LayoutSVGHiddenContainer` — so they're hidden from the visual tree and never
painted directly. Clients register via `SVGResources::UpdateEffects()`
(for clip/mask/filter) and receive invalidation via
`SVGResourceClient::ResourceContentChanged()`.

```cpp
// third_party/blink/renderer/core/layout/svg/svg_resources.h
class SVGResources {
 public:
  static SVGElementResourceClient* GetClient(const LayoutObject&);
  static gfx::RectF ReferenceBoxForEffects(
      const LayoutObject&,
      GeometryBox = GeometryBox::kFillBox,
      ForeignObjectQuirk = ForeignObjectQuirk::kEnabled);
  static void UpdateEffects(LayoutObject&, StyleDifference,
                            const ComputedStyle* old_style);
  static void UpdatePaints(const LayoutObject&,
                           const ComputedStyle* old_style,
                           const ComputedStyle& style);
};
```

The distinction between `UpdateEffects` and `UpdatePaints`:

- **Paints** = `fill` and `stroke` resources (gradient, pattern) — fast path,
  resolved as shaders with no offscreen buffer.
- **Effects** = clip, mask, filter — slow path, may require offscreen
  rendering and/or compositor render surfaces.

## `<clipPath>`

A clip path intersects the rendering region with a geometric shape. Two flavors:

### Path-based clip (fast path)

If `<clipPath>` contains only shapes and its clipping is simple enough,
`LayoutSVGResourceClipper` produces a single `Path` (union of the children,
with winding rule). This is applied as a
`GraphicsContext::ClipPath()`:

```cpp
// third_party/blink/renderer/core/layout/svg/layout_svg_resource_clipper.h
class LayoutSVGResourceClipper final : public LayoutSVGResourceContainer {
 public:
  std::optional<Path> AsPath();   // path-based clip if possible
  void Trace(Visitor*) const override;
 private:
  HeapHashMap<Member<const SVGResourceClient>,
              std::unique_ptr<ClipPathCache>> clip_path_cache_;
};
```

- `clipPathUnits="userSpaceOnUse"` — coordinates are in user space of
  the referencing element.
- `clipPathUnits="objectBoundingBox"` — coordinates are fractions of the
  referencing element's bounding box.

### Mask-based clip (slow path)

If the clip path contains text, uses nested clip paths, or otherwise can't
collapse to a single `Path`, Blink falls back to rasterizing the clip into
an alpha mask and applying it as a mask. This forces creation of a render
surface.

### Winding rule

`clip-rule: nonzero | evenodd` governs how self-intersecting shapes are
treated. Winding rule is per-child of the clip-path, so different children
can have different rules.

## `<mask>`

A mask is always an offscreen buffer. The `<mask>` element's children are
painted into an offscreen surface, and the referencing element's rendering
is multiplied by the mask's alpha (or luminance).

```cpp
// third_party/blink/renderer/core/layout/svg/layout_svg_resource_masker.h
class LayoutSVGResourceMasker final : public LayoutSVGResourceContainer {
 public:
  PaintRecord CreatePaintRecord(AffineTransform&,
                                const gfx::RectF& reference_box,
                                const AutoDarkMode&);
  gfx::RectF ResourceBoundingBox(const gfx::RectF& reference_box, float zoom);
};
```

- `maskContentUnits` + `maskUnits` — same userSpaceOnUse / objectBoundingBox
  semantics as pattern.
- `mask-type` / `mask-mode` (CSS masks integration): `luminance` or `alpha`.
  SVG 1.1 masks use luminance by default; CSS masks default to alpha.

A mask **always creates a render surface** (see
[render-surfaces.md](../render-surfaces.md)), because the offscreen
composition is required to compute the masked result before drawing to the
parent surface.

## `<filter>`

Filters are the most complex resource type. A `<filter>` contains a sequence
of "filter primitives" that form a directed acyclic graph; the graph is
compiled to a composed Skia `ImageFilter` which is applied to the referencing
element's rendering.

### Primitive set

```
feBlend              feColorMatrix          feComponentTransfer
feComposite          feConvolveMatrix       feDiffuseLighting
feDisplacementMap    feDropShadow           feFlood
feGaussianBlur       feImage                feMerge
feMorphology         feOffset               feSpecularLighting
feTile               feTurbulence
```

Each primitive is a `<feXxx>` element; attributes `in`, `in2`, `result`
define inputs and name the output. Implicit inputs: `SourceGraphic`,
`SourceAlpha`, `BackgroundImage`, `BackgroundAlpha`, `FillPaint`,
`StrokePaint`.

### Filter graph construction

```cpp
// third_party/blink/renderer/core/svg/graphics/filters/svg_filter_builder.h
class SVGFilterBuilder {
 public:
  SVGFilterBuilder(FilterEffect* source_graphic,
                   SVGFilterGraphNodeMap* = nullptr,
                   const cc::PaintFlags* fill_flags = nullptr,
                   const cc::PaintFlags* stroke_flags = nullptr);
  void BuildGraph(Filter*, SVGFilterElement&, const gfx::RectF&,
                  const std::optional<gfx::SizeF>& override_viewport);
};
```

Each primitive becomes a `FilterEffect` subclass (`FEGaussianBlur`,
`FEColorMatrix`, …), which implements `CreateImageFilter()` returning a Skia
`sk_sp<PaintFilter>`. The graph is walked bottom-up to compose a single
`PaintFilter` tree, which is attached to `cc::PaintFlags::setImageFilter()`
or applied via a render-surface-level filter.

### Compositor integration

For CSS `filter` (the `<filter>` ref from `filter: url(#id)`), Blink can
translate the filter graph to a `CompositorFilterOperations` (a sequence of
`cc::FilterOperation` values). This allows the compositor thread to apply
the filter without re-rastering, and enables GPU-accelerated filter
execution. The cache is stored on the `SVGElementResourceClient`:

```cpp
void SVGElementResourceClient::UpdateFilterData(CompositorFilterOperations&);
```

### Filters force render surfaces

Any element with `filter: url(#id)` forces a render surface. See
[render-surfaces.md](../render-surfaces.md) and
[effect-optimizations.md](../effect-optimizations.md) — Blink demotes
filters to paint-time when it can prove the compositor doesn't need them,
e.g., when the element has no children and no other effects.

### Filter region

`<filter x= y= width= height=>` defines the **filter region** — the
rectangle in user space outside of which the filter output is clipped to
transparent. `filterUnits` decides whether x/y/w/h are userSpaceOnUse or
objectBoundingBox. This region is expanded during damage tracking so that
blur halos remain visible (see [damage-tracking.md](../damage-tracking.md)).

## `<marker>`

Markers paint arrowheads or tick marks at path vertices. They're referenced
via `marker-start`, `marker-mid`, `marker-end` on a shape.

### Marker placement

```cpp
// third_party/blink/renderer/core/layout/svg/svg_marker_data.h
enum SVGMarkerType { kStartMarker, kMidMarker, kEndMarker };

struct MarkerPosition {
  SVGMarkerType type;
  gfx::PointF origin;
  float angle;
};

class SVGMarkerDataBuilder : private SVGPathConsumer {
 public:
  void Build(const Path&);
  void Build(const SVGPathByteStream&);
 private:
  enum AngleType { kBisecting, kInbound, kOutbound };
  double CurrentAngle(AngleType) const;
};
```

`SVGMarkerDataBuilder` walks the path as it's emitted segment-by-segment,
computing tangent vectors. For each marker position:

- **Start** — first point after `moveto`; angle = outgoing tangent.
- **End** — last point of each subpath; angle = incoming tangent.
- **Mid** — interior segment joins; angle = bisecting tangent (unless
  `orient="auto"` vs explicit).

### Marker painting

```cpp
// called from SVGShapePainter
void PaintMarker(const PaintInfo&,
                 LayoutSVGResourceMarker&,
                 const MarkerPosition&,
                 float stroke_width);
```

For each position:

1. Translate to `origin`.
2. Rotate by `angle` (unless `orient="angle"` specifies an explicit angle,
   or `orient="auto-start-reverse"` flips start markers).
3. Scale by `markerUnits`:
   - `strokeWidth` (default) → scale by the referencing shape's stroke width
   - `userSpaceOnUse` → 1:1
4. Apply `refX`/`refY` to shift the marker's origin relative to its bounds.
5. Paint the marker's content (children of `<marker>`) into this local
   frame, optionally clipped by the marker's `viewBox`.

Markers respect `paint-order: fill | stroke | markers` on the referencing
shape.

## Paint order integration

`SVGShapePainter::PaintShape()` iterates `paint-order` (default `fill, stroke,
markers`), and for each step:

1. **Fill** — `SVGObjectPainter::PreparePaint(kApplyToFillMode)` →
   `DrawPath(fill_flags)`.
2. **Stroke** — `PreparePaint(kApplyToStrokeMode)` →
   `DrawPath(stroke_flags)`.
3. **Markers** — iterate `MarkerPosition`s from
   `SVGMarkerDataBuilder`, paint each via nested paint state.

Clip paths, masks, and filters on the shape are established **before** this
loop (via `ScopedSVGPaintState`), so all three steps happen inside the
effect.

## Source files

| File                                             | Role                                   |
| ------------------------------------------------ | -------------------------------------- |
| `core/layout/svg/svg_resources.h`                | Client registration + lookup           |
| `core/layout/svg/layout_svg_resource_clipper.h`  | `<clipPath>` — path + fallback mask    |
| `core/layout/svg/layout_svg_resource_masker.h`   | `<mask>` — offscreen composition       |
| `core/layout/svg/layout_svg_resource_filter.h`   | `<filter>` container                   |
| `core/layout/svg/layout_svg_resource_marker.h`   | `<marker>` — arrowheads                |
| `core/layout/svg/svg_marker_data.h`              | Marker position/angle builder          |
| `core/svg/graphics/filters/svg_filter_builder.h` | Filter graph construction              |
| `platform/graphics/filters/filter_effect.h`      | Base class for filter primitives       |
| `core/paint/svg_shape_painter.cc`                | Paint-order iteration, marker painting |
