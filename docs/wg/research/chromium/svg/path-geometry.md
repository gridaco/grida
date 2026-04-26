---
title: "Chromium SVG Path Geometry and Stroking"
tags:
  - internal
  - research
  - chromium
  - rendering
  - svg
---

# Chromium SVG Path Geometry and Stroking

How `<path d="...">` data becomes an `SkPath`, and how SVG stroke properties
(`stroke-width`, `stroke-linecap`, `stroke-dasharray`, …) are mapped to Skia.

## Path data parsing

### Byte stream representation

`SVGPath` stores parsed path data in an `SVGPathByteStream` — a compact
binary format that represents each segment as a command byte plus its
float parameters. This is the canonical internal representation; the
ASCII `d="M 10 10 L 50 50"` string is parsed once and cached.

```cpp
// third_party/blink/renderer/core/svg/svg_path.h
class SVGPath final : public SVGPropertyBase {
 public:
  const SVGPathByteStream& ByteStream() const;
  SVGPath* Clone() const;
  String ValueAsString() const override;
  SVGParsingError SetValueAsString(const String&);
};
```

### Parser — consumer pattern

The parser is a template-based producer/consumer:

```cpp
// third_party/blink/renderer/core/svg/svg_path_parser.h
namespace svg_path_parser {
  template <typename SourceType, typename ConsumerType>
  inline bool ParsePath(SourceType& source, ConsumerType& consumer) {
    while (source.HasMoreData()) {
      PathSegmentData segment = source.ParseSegment();
      if (segment.command == kPathSegUnknown) return false;
      consumer.EmitSegment(segment);
    }
    return true;
  }
}
```

Sources: `SVGPathStringSource` (ASCII `d=`), `SVGPathByteStreamSource` (compact
binary).

Consumers:

- `SVGPathByteStreamBuilder` — writes into a new byte stream.
- `SVGPathNormalizer` — converts relative commands to absolute; keeps arcs.
- `SVGPathStringBuilder` — serializes back to ASCII.
- `SVGPathBuilder` — **the renderer consumer**: builds a `Path` (SkPath
  wrapper) by emitting `moveTo`, `lineTo`, `cubicTo`, etc.
- `SVGMarkerDataBuilder` — walks to compute marker positions (see
  [resources-and-effects.md](./resources-and-effects.md)).
- `SVGPathAbsolutizer` — variant of normalizer.

Arcs (`A`/`a` command) are typically converted to cubic Béziers at build
time via the standard endpoint-to-center-parameterization + arc-to-cubic
decomposition.

## `Path` — the Skia wrapper

`Path` (`third_party/blink/renderer/platform/graphics/path.h`) is Blink's
wrapper around `SkPath`. It adds helpers that SVG needs:

- `BoundingRect()`, `StrokeBoundingRect(const StrokeData&)`
- `Contains(const gfx::PointF&, WindRule)` — point-in-path hit testing
- `StrokeContains(const gfx::PointF&, const StrokeData&)`
- `ApplyTransform(const AffineTransform&)`

Shapes build their `Path` lazily via `SVGGeometryElement::AsPath()`, which
dispatches to element-specific construction:

```cpp
// third_party/blink/renderer/core/layout/svg/layout_svg_shape.cc
void LayoutSVGShape::CreatePath() {
  if (!path_)
    path_ = std::make_unique<Path>();
  *path_ = To<SVGGeometryElement>(GetElement())->AsPath();
  DCHECK(!stroke_path_cache_);
}
```

`<rect>`, `<circle>`, `<ellipse>`, `<line>`, `<polygon>`, `<polyline>` each
build their own `Path` directly (e.g., `SVGRectElement::AsPath()` constructs
a rectangle, or a rounded rect if `rx`/`ry` are set). `<path>` replays the
byte stream through `SVGPathBuilder`.

## Fill rule and winding

`fill-rule: nonzero | evenodd` (and `clip-rule` for clip paths) maps
directly to Skia's `SkPathFillType::kWinding` / `kEvenOdd`. The fill rule is
not stored on the `SkPath` itself when it's used for stroking — it's only
applied at fill time.

## Stroke

### Stroke properties mapping

```cpp
// third_party/blink/renderer/core/layout/svg/svg_layout_support.h
static void ApplyStrokeStyleToStrokeData(StrokeData&,
                                         const ComputedStyle&,
                                         const LayoutObject&,
                                         float dash_scale_factor);
```

`StrokeData` (`platform/graphics/stroke_data.h`) maps as follows:

| SVG / CSS property  | `StrokeData` field       | Skia / SkPaint equivalent               |
| ------------------- | ------------------------ | --------------------------------------- |
| `stroke-width`      | `thickness_`             | `SkPaint::setStrokeWidth`               |
| `stroke-linecap`    | `line_cap_`              | `SkPaint::Cap` — Butt / Round / Square  |
| `stroke-linejoin`   | `line_join_`             | `SkPaint::Join` — Miter / Round / Bevel |
| `stroke-miterlimit` | `miter_limit_`           | `SkPaint::setStrokeMiter`               |
| `stroke-dasharray`  | `dash_`                  | `SkDashPathEffect::Make(intervals, …)`  |
| `stroke-dashoffset` | phase arg of dash effect | same                                    |

### Dash scaling for transforms

```cpp
// layout_svg_shape.cc
StrokeData stroke_data;
SVGLayoutSupport::ApplyStrokeStyleToStrokeData(stroke_data, StyleRef(), *this,
                                               DashScaleFactor());
```

`DashScaleFactor()` accounts for uniform scale components of the element's
transform so that `stroke-dasharray` intervals remain visually consistent
when the shape is scaled. For non-uniform scales, the approximation can
diverge from the spec.

### Non-scaling stroke

`vector-effect: non-scaling-stroke` un-scales the path before stroking. See
[coordinate-systems.md](./coordinate-systems.md#non-scaling-stroke).

### Stroke-path cache

```cpp
// layout_svg_shape.h
mutable std::unique_ptr<Path> stroke_path_cache_;
```

The actual stroked `Path` (result of applying stroke width to the geometry)
is cached for hit testing — computing a stroke outline is expensive, so
hit tests reuse it across pointer events until the geometry, transform, or
stroke properties change.

### Stroke bounds

```cpp
// layout_svg_shape.cc
gfx::RectF LayoutSVGShape::StrokeBoundingBox() const {
  if (!StyleRef().HasStroke() || IsShapeEmpty())
    return fill_bounding_box_;
  if (!HasPath()) {
    DCHECK(CanUseSimpleStrokeApproximation(geometry_type_));
    return ApproximateStrokeBoundingBox(fill_bounding_box_);
  }
  StrokeData stroke_data;
  SVGLayoutSupport::ApplyStrokeStyleToStrokeData(stroke_data, StyleRef(),
                                                 *this, DashScaleFactor());
  DashArray dashes;
  stroke_data.SetLineDash(dashes, 0);  // dashes don't affect bounds per spec
  const gfx::RectF stroke_bounds = GetPath().StrokeBoundingRect(stroke_data);
  return gfx::UnionRects(fill_bounding_box_, stroke_bounds);
}
```

Two fast paths:

- Empty shape → fill bbox only (no stroke).
- Simple geometry (rect, circle, ellipse, line) where bounds can be computed
  analytically → `ApproximateStrokeBoundingBox()` inflates fill bbox by
  ~`stroke-width / 2 * miter_factor`.

Otherwise, Skia computes stroke bounds from the actual stroke outline.

Dashes are explicitly cleared before computing bounds — the SVG spec says
bounds should reflect the un-dashed stroke envelope, not the gap regions.

## Shape rendering modes

`shape-rendering: auto | optimizeSpeed | crispEdges | geometricPrecision`
maps to Skia anti-aliasing and hinting:

- `crispEdges` — disable antialiasing (`SkPaint::setAntiAlias(false)`).
- `optimizeSpeed` — implementation-defined; Blink treats as `crispEdges`
  when beneficial.
- `geometricPrecision`, `auto` — full anti-aliasing.

## Hit testing fill and stroke

```cpp
// layout_svg_shape.cc
bool LayoutSVGShape::ShapeDependentFillContains(
    const HitTestLocation& location,
    const WindRule fill_rule) const {
  return location.Intersects(GetPath(), fill_rule);
}

bool LayoutSVGShape::ShapeDependentStrokeContains(
    const HitTestLocation& location) {
  if (!stroke_path_cache_) {
    const Path* path = path_.get();
    AffineTransform root_transform;
    if (HasNonScalingStroke()) {
      root_transform.Scale(StyleRef().EffectiveZoom())
          .PreConcat(NonScalingStrokeTransform());
      path = &NonScalingStrokePath();
    }
    StrokeData stroke_data;
    SVGLayoutSupport::ApplyStrokeStyleToStrokeData(
        stroke_data, StyleRef(), *this, DashScaleFactor());
    stroke_path_cache_ = std::make_unique<Path>(
        path->StrokePath(stroke_data, root_transform));
  }
  return stroke_path_cache_->Contains(location.TransformedPoint());
}
```

Hit testing follows `pointer-events` to decide whether to test fill, stroke,
or both.

## Source files

| File                                   | Role                                          |
| -------------------------------------- | --------------------------------------------- |
| `core/svg/svg_path.h`                  | Parsed path wrapper; byte stream              |
| `core/svg/svg_path_parser.h`           | Template parser; consumer pattern             |
| `core/svg/svg_path_byte_stream.h`      | Compact binary representation                 |
| `core/svg/svg_path_builder.h`          | Byte stream → `Path` (SkPath) construction    |
| `core/svg/svg_path_string_source.h`    | ASCII `d=` tokenizer                          |
| `core/svg/svg_path_normalizer.h`       | Relative → absolute, arc-to-cubic             |
| `core/layout/svg/layout_svg_shape.h`   | Shape base; owns `Path`, `stroke_path_cache_` |
| `core/layout/svg/svg_layout_support.h` | `ApplyStrokeStyleToStrokeData()`              |
| `platform/graphics/path.h`             | Blink `Path` wrapper around `SkPath`          |
| `platform/graphics/stroke_data.h`      | Stroke properties value object                |
