---
title: "Chromium SVG Coordinate Systems"
tags:
  - internal
  - research
  - chromium
  - rendering
  - svg
---

# Chromium SVG Coordinate Systems

How Blink tracks transforms and coordinate spaces from the outer `<svg>` down
to a leaf shape. This is the conceptual difference between HTML layout
(rectangular boxes in CSS pixels) and SVG layout (user units, viewBoxes,
per-element transforms).

## The coordinate-space hierarchy

For a deeply nested shape, the full transform chain is:

```
Shape local (user units)
    │  LocalSVGTransform()              (the shape's own `transform` attribute)
    ▼
Parent SVG coords
    │  chain of ancestor LocalToSVGParentTransform() up to nearest <svg>
    ▼
Nearest <svg> viewport coords (user units inside that <svg>)
    │  viewBoxToViewTransform (viewBox → viewport)
    ▼
Nearest <svg> viewport (CSS-px inside that <svg>)
    │  if nested, repeat for outer <svg>
    ▼
Outer <svg> CSS box
    │  LocalToBorderBoxTransform() on LayoutSVGRoot
    ▼
CSS layout tree (HTML border box)
    │  standard HTML transforms
    ▼
Screen
```

Blink exposes this via `SVGElement::LocalCoordinateSpaceTransform(CTMScope)`,
which JavaScript's `getCTM()` and `getScreenCTM()` call:

```cpp
// third_party/blink/renderer/core/svg/svg_element.h
enum CTMScope {
  kNearestViewportScope,  // getCTM() — up to nearest <svg>
  kScreenScope,           // getScreenCTM() — all the way to the screen
  kAncestorScope,         // getEnclosureList()
};
virtual AffineTransform LocalCoordinateSpaceTransform(CTMScope) const;
```

## `LayoutSVGRoot` — the bridge

`LayoutSVGRoot` is the single object responsible for translating between CSS
box layout and SVG's internal coordinate space.

```cpp
// third_party/blink/renderer/core/layout/svg/layout_svg_root.h
class LayoutSVGRoot final : public LayoutReplaced {
 public:
  void LayoutRoot(const PhysicalRect& content_rect);
  const AffineTransform& LocalToBorderBoxTransform() const {
    return local_to_border_box_transform_;
  }
  gfx::RectF ViewBoxRect() const;
  gfx::SizeF ViewportSize() const;
};
```

- **CSS side:** `LayoutSVGRoot` extends `LayoutReplaced`, so CSS treats it
  like an `<img>` — it has `width`/`height`/`aspect-ratio`, participates in
  flex/grid/block layout, and has a border box.
- **SVG side:** inside its border box, the `<svg>` establishes an SVG
  viewport in user units. `viewBox` and `preserveAspectRatio` map that
  viewport to the border box.

`LocalToBorderBoxTransform()` is the pre-composed transform that encodes:

1. Translation to the SVG viewport origin within the border box (CSS
   padding + border offset).
2. Scaling + translation from `viewBox` to viewport size, accounting for
   `preserveAspectRatio` alignment (`xMidYMid meet`, `xMinYMin slice`, …).
3. CSS `zoom` and device-pixel scale where applicable.

## `viewBox` and `preserveAspectRatio`

The implementation is in `SVGFitToViewBox`:

```cpp
// third_party/blink/renderer/core/svg/svg_fit_to_view_box.h
static AffineTransform ViewBoxToViewTransform(
    const gfx::RectF& view_box,
    const SVGPreserveAspectRatio&,
    const gfx::SizeF& viewport_size);
```

This function is called in at least three places:

- `LayoutSVGRoot` — outer `<svg>` to border box.
- `LayoutSVGViewportContainer` — nested `<svg>` inside another.
- `LayoutSVGResourcePattern::BuildPatternData()` — `<pattern>` with a
  `viewBox` (see [paint-servers.md](./paint-servers.md)).
- `LayoutSVGResourceMarker` — `<marker>` with a `viewBox`.

`preserveAspectRatio` values: `none`, `xMin/xMid/xMax × YMin/YMid/YMax`, each
paired with `meet` (fit fully, letterbox) or `slice` (fill fully, crop).

Default: `xMidYMid meet`.

## `LocalToSVGParentTransform()`

Every `LayoutSVGModelObject` carries an `AffineTransform` mapping its own
coordinate space to its parent's. Sources that contribute:

1. The element's `transform` attribute.
2. CSS `transform` (SVG 2 merged these with CSS).
3. `x` / `y` attributes on elements like `<svg>`, `<use>`, `<foreignObject>`
   (treated as a translate).
4. `viewBox` → viewport for nested `<svg>` (handled inside the viewport
   container's transform).
5. `animateMotion` offset (SMIL motion path).
6. Non-scaling-stroke correction (not the element's own transform, but a
   stroke-time un-scale; see [path-geometry.md](./path-geometry.md)).

```cpp
// LayoutSVGModelObject exposes:
virtual AffineTransform LocalSVGTransform() const;        // this element's transform
virtual AffineTransform LocalToSVGParentTransform() const; // composed
```

The painter calls `LocalSVGTransform()` before recording child paint ops
(via `ScopedSVGTransformState`), so the composed CTM naturally accumulates
down the tree without requiring a separate property tree traversal.

## Percentage length resolution

SVG percentages resolve differently from CSS. A `<rect width="50%">` resolves
against the **nearest viewport-establishing ancestor** — the nearest
`<svg>` or `<symbol>`, not the immediate parent. This is handled by
`SVGLengthContext`:

```cpp
// third_party/blink/renderer/core/svg/svg_length_context.h
class SVGLengthContext {
 public:
  explicit SVGLengthContext(const SVGElement* context);
  float ValueForLength(const Length&, SVGLengthMode) const;
  // …
};
```

`SVGLengthMode` is one of `kWidth`, `kHeight`, `kOther` (diagonal =
sqrt(w² + h²) / sqrt(2)) — the spec requires different resolution axes for
different attributes.

## Pattern & gradient units

`patternUnits`, `patternContentUnits`, `gradientUnits` use one of:

- `userSpaceOnUse` — coordinates are in the user space of the element
  **referencing** the paint server.
- `objectBoundingBox` — coordinates are fractions of the referencing
  element's bounding box (so `x="0"` to `x="1"` spans the whole shape).

This is resolved in `LayoutSVGResourcePattern::BuildPatternData()` and the
equivalent for gradients, producing an `AffineTransform` that is composed
into the shader's local matrix.

## Non-scaling stroke

`vector-effect: non-scaling-stroke` decouples stroke width from the element's
transform. Implementation:

```cpp
// third_party/blink/renderer/core/layout/svg/layout_svg_shape.cc
if (HasNonScalingStroke()) {
  root_transform.Scale(StyleRef().EffectiveZoom())
      .PreConcat(NonScalingStrokeTransform());
  path = &NonScalingStrokePath();
}
```

The path is pre-transformed into a coordinate space where scale has been
factored out, then stroked at the nominal width, then projected back. The
result is a stroke whose visual width is independent of the element's
transform.

## Hit-test coordinate mapping

Hit tests start in CSS-pixel screen space and walk down:

1. `LayoutSVGRoot::NodeAtPoint()` applies the inverse of
   `LocalToBorderBoxTransform()` to get SVG viewport coords.
2. `LayoutSVGContainer::NodeAtPoint()` iterates children in paint order,
   recursively applying each child's `LocalSVGTransform().Inverse()`.
3. `LayoutSVGShape::NodeAtPoint()` tests the transformed location against
   the cached `Path` (fill via winding rule, stroke via the cached
   `stroke_path_cache_`).

`pointer-events` gates whether fill/stroke count:
`auto | none | visiblePainted | visibleFill | visibleStroke | visible |
painted | fill | stroke | all`.

## Source files

| File                                                                              | Role                                             |
| --------------------------------------------------------------------------------- | ------------------------------------------------ |
| `third_party/blink/renderer/core/svg/svg_element.h`                               | `LocalCoordinateSpaceTransform`, CTMScope        |
| `third_party/blink/renderer/core/svg/svg_fit_to_view_box.h`                       | `ViewBoxToViewTransform()`                       |
| `third_party/blink/renderer/core/svg/svg_preserve_aspect_ratio.h`                 | Alignment / meet-or-slice enum                   |
| `third_party/blink/renderer/core/svg/svg_length_context.h`                        | Percentage and unit resolution                   |
| `third_party/blink/renderer/core/layout/svg/layout_svg_root.h`                    | Outer `<svg>`; `LocalToBorderBoxTransform`       |
| `third_party/blink/renderer/core/layout/svg/layout_svg_viewport_container.h`      | Nested `<svg>`                                   |
| `third_party/blink/renderer/core/layout/svg/layout_svg_transformable_container.h` | `<g transform=…>`                                |
| `third_party/blink/renderer/core/layout/svg/layout_svg_model_object.h`            | `LocalSVGTransform`, `LocalToSVGParentTransform` |
