---
title: "Chromium SVG Paint Servers"
tags:
  - internal
  - research
  - chromium
  - rendering
  - svg
---

# Chromium SVG Paint Servers

How `fill="url(#id)"` and `stroke="url(#id)"` resolve into Skia shaders. Paint
servers are the `<linearGradient>`, `<radialGradient>`, and `<pattern>`
elements. They are **resources** — they never create compositor layers or
render surfaces; they produce shaders applied to draw calls at paint time.

A deep-dive on `<pattern>` specifically lives at
[svg-pattern.md](../svg-pattern.md). This document covers the shared paint
server architecture and gradients.

## Class hierarchy

```
LayoutSVGHiddenContainer                  never visual; extends LayoutSVGContainer
  └── LayoutSVGResourceContainer          base for all <defs>-type resources
        ├── LayoutSVGResourcePaintServer  ApplyShader() → cc::PaintFlags
        │     ├── LayoutSVGResourcePattern
        │     └── LayoutSVGResourceGradient
        │           ├── LayoutSVGResourceLinearGradient
        │           └── LayoutSVGResourceRadialGradient
        ├── LayoutSVGResourceClipper      (see resources-and-effects.md)
        ├── LayoutSVGResourceMasker
        ├── LayoutSVGResourceFilter
        └── LayoutSVGResourceMarker
```

All paint servers share the same entry point:

```cpp
// third_party/blink/renderer/core/layout/svg/layout_svg_resource_paint_server.h
class LayoutSVGResourcePaintServer : public LayoutSVGResourceContainer {
 public:
  virtual bool ApplyShader(const SVGResourceClient&,
                           const gfx::RectF& reference_box,
                           const AffineTransform* additional_transform,
                           const AutoDarkMode&,
                           cc::PaintFlags&) = 0;
};
```

## Resolution pipeline — from `fill="url(#id)"` to shader

1. **Style cascade** — `fill: url(#id)` becomes an `SVGPaintType::kUriFunction`
   in `SVGComputedStyle::fill.Resource()`.
2. **Client registration** — when a `LayoutSVG*` object is created for a shape
   that references a resource, `SVGResources::UpdatePaints()` registers the
   shape as a client of the target element via `SVGElementResourceClient`.
3. **Paint time** — `SVGShapePainter` calls `SVGObjectPainter::PreparePaint()`,
   which looks up the resource and calls `ApplyShader()`:

```cpp
// third_party/blink/renderer/core/paint/svg_object_painter.cc
bool ApplyPaintResource(const SvgContextPaints::ContextPaint& context_paint,
                        const AffineTransform* additional_paint_server_transform,
                        cc::PaintFlags& flags) {
  SVGElementResourceClient* client =
      SVGResources::GetClient(context_paint.object);
  auto* uri_resource = GetSVGResourceAsType<LayoutSVGResourcePaintServer>(
      *client, context_paint.paint.Resource());
  if (!uri_resource->ApplyShader(
          *client, SVGResources::ReferenceBoxForEffects(context_paint.object),
          additional_paint_server_transform, auto_dark_mode, flags))
    return false;
  return true;
}
```

4. **Shader attached** — the paint server sets `cc::PaintShader` on the
   `cc::PaintFlags`, which is then used by the subsequent `DrawPath` /
   `DrawRect`.

`SVGResources::ReferenceBoxForEffects()` returns the bounding box to use
for `objectBoundingBox` resolution; this is configurable via
`geometry_box` (`fill-box` / `stroke-box` / `view-box`) from the
`geometry-box` CSS value.

## Per-client caching

Paint servers maintain a per-client cache because `objectBoundingBox` makes
tile/gradient geometry depend on the referencing shape's bounds:

```cpp
// third_party/blink/renderer/core/layout/svg/layout_svg_resource_pattern.h
// A pattern can be referenced by many shapes; each shape may have a
// different bounding box, so each client needs its own Pattern shader.
HeapHashMap<Member<const SVGResourceClient>, std::unique_ptr<PatternData>>
    pattern_map_;
```

Gradients follow the same pattern.

Invalidation: when the resource element changes, `SVGResource` notifies its
clients via `SVGResourceClient::ResourceContentChanged()`, which clears the
cache and schedules paint invalidation on each shape.

## Gradients

### Attribute collection

Gradients inherit attributes through an `xlink:href` chain (same as patterns).
`SVGGradientElement::CollectCommonAttributes()` walks the href chain with
cycle detection, filling in any unset attributes from referenced elements.

Common gradient attributes:

- `gradientUnits` — `userSpaceOnUse` or `objectBoundingBox`
- `gradientTransform` — applied as shader local matrix
- `spreadMethod` — `pad` / `reflect` / `repeat` (Skia `SkTileMode`)
- color stops (from `<stop>` children): offset, color, opacity

Linear-specific: `x1`, `y1`, `x2`, `y2` (the gradient vector).
Radial-specific: `cx`, `cy`, `r`, `fx`, `fy`, `fr` (center, radius, focal).

### BuildGradientData

```cpp
// third_party/blink/renderer/core/layout/svg/layout_svg_resource_gradient.cc
std::unique_ptr<GradientData> LayoutSVGResourceGradient::BuildGradientData(
    const gfx::RectF& object_bounding_box) {
  const GradientAttributes& attributes = EnsureAttributes();
  auto gradient_data = std::make_unique<GradientData>();

  // 1. Resolve endpoints in user space:
  //    objectBoundingBox → scale by object bbox, then translate
  //    userSpaceOnUse    → already in user space

  // 2. Build Gradient with resolved stops + spread mode

  // 3. Apply gradientTransform to Gradient's local matrix
  gradient_data->gradient->SetGradientSpaceTransform(gradient_transform);
  return gradient_data;
}
```

The resolved `Gradient` (platform wrapper around `SkShader`) produces a
`cc::PaintShader` via `Gradient::CreateShader()`, which is attached to
`cc::PaintFlags` identically to the pattern case.

## Patterns

See [svg-pattern.md](../svg-pattern.md) for the full walkthrough. In short:

1. `CollectPatternAttributes()` — walk href chain, fill defaults.
2. `BuildPatternData()`:
   - Resolve `tile_bounds` (x/y/width/height) in user space.
   - Resolve `tile_transform` from `viewBox` or `patternContentUnits`.
   - Call `AsPaintRecord(tile_transform)` — record tile children into a
     `PaintRecord` (**not** a bitmap).
   - Wrap recording in `PaintRecordPattern`, create `PaintShader` with
     `SkTileMode::kRepeat` on both axes.
   - Compose shader local matrix:
     `Translate(tile.x, tile.y) · patternTransform`.
3. `ApplyShader()` caches per client, applies shader to `cc::PaintFlags`.

Key insight: the tile is a display list, not a rasterized bitmap. Skia
rasterizes it lazily at the correct scale, so patterns stay
resolution-independent.

## Shared abstractions

```
platform/graphics/
├── Pattern               abstract; holds cached PaintShader
│   ├── ImagePattern      raster-image patterns (CSS background-image)
│   └── PaintRecordPattern SVG <pattern> — record-based tiling
└── Gradient              abstract; holds stops + spread + local matrix
    ├── LinearGradient
    ├── RadialGradient
    └── ConicGradient     CSS conic-gradient() only (no SVG equivalent)
```

Both `Pattern` and `Gradient` expose `ApplyToFlags(cc::PaintFlags&,
SkMatrix& local_matrix)`, which constructs the `cc::PaintShader` and attaches
it. The shader is cached so long as `local_matrix` doesn't change.

## What paint servers never do

- They never create compositor layers.
- They never create render surfaces (see [render-surfaces.md](../render-surfaces.md)).
- They never trigger compositing promotion.
- They never participate in damage tracking as visual elements — they're
  pure shader sources.

Any SVG feature that would need compositing (blend mode, filter, mask on a
**consuming** shape) is handled by that consuming shape, not by the paint
server.

## Source files

| File                                                                                | Role                                                  |
| ----------------------------------------------------------------------------------- | ----------------------------------------------------- |
| `third_party/blink/renderer/core/layout/svg/layout_svg_resource_paint_server.h`     | Abstract base                                         |
| `third_party/blink/renderer/core/layout/svg/layout_svg_resource_gradient.cc`        | Gradient base; `BuildGradientData()`, `ApplyShader()` |
| `third_party/blink/renderer/core/layout/svg/layout_svg_resource_linear_gradient.cc` | Linear-specific                                       |
| `third_party/blink/renderer/core/layout/svg/layout_svg_resource_radial_gradient.cc` | Radial-specific                                       |
| `third_party/blink/renderer/core/layout/svg/layout_svg_resource_pattern.cc`         | See [svg-pattern.md](../svg-pattern.md)               |
| `third_party/blink/renderer/core/paint/svg_object_painter.cc`                       | Resource resolution at paint time                     |
| `third_party/blink/renderer/platform/graphics/gradient.cc`                          | Platform gradient wrapper                             |
| `third_party/blink/renderer/platform/graphics/pattern.cc`                           | Platform pattern wrapper                              |
