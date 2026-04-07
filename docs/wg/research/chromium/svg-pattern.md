---
title: "Chromium SVG Pattern Paint Server"
format: md
tags:
  - internal
  - research
  - chromium
  - rendering
  - svg
---

# Chromium SVG Pattern Paint Server

How Chromium handles the SVG `<pattern>` element. The pattern element is a
**paint server** — a resource container that produces a tiling shader. It is
never a visual node in the render tree or compositor layer tree.

For how `PaintRecord` works as a display list see
[paint-recording.md](./paint-recording.md). For render surfaces and compositing
see [render-surfaces.md](./render-surfaces.md).

---

## Class Hierarchy

```
LayoutSVGHiddenContainer
  └── LayoutSVGResourceContainer         (base for clips, masks, filters, paint servers)
        └── LayoutSVGResourcePaintServer  (base: pattern + gradient)
              ├── LayoutSVGResourcePattern
              └── LayoutSVGResourceGradient
```

On the DOM side:

```
SVGElement
  └── SVGPatternElement  (also mixes in SVGURIReference, SVGTests, SVGFitToViewBox)
```

On the platform graphics side:

```
Pattern (abstract, ref-counted, holds cached PaintShader)
  ├── ImagePattern         (raster image patterns)
  └── PaintRecordPattern   (SVG <pattern> — record-based tiling)
```

`LayoutSVGResourcePattern` inherits from `LayoutSVGHiddenContainer`. It is
explicitly **hidden** from the visual tree. It does not create a compositor
layer or render surface. It only participates as a resource that produces a
shader when referenced by `fill="url(#id)"` or `stroke="url(#id)"`.

Source: `third_party/blink/renderer/core/layout/svg/layout_svg_resource_pattern.h`

---

## Pipeline Overview

```
SVGPatternElement (DOM)
    │ CreateLayoutObject()
    ▼
LayoutSVGResourcePattern (hidden resource container, not in visual tree)
    │ ApplyShader() — called when a client shape needs fill/stroke
    ▼
BuildPatternData(object_bounding_box)
    ├── CollectPatternAttributes()       → resolved PatternAttributes (with href chain)
    ├── ResolveRectangle()               → tile_bounds (x, y, w, h in user units)
    ├── ViewBoxToViewTransform()         → tile_transform (or patternContentUnits scale)
    ├── AsPaintRecord(tile_transform)    → PaintRecord (display list of tile content)
    │       ├── PaintRecorder::beginRecording()
    │       ├── SubtreeContentTransformScope(tile_transform)
    │       ├── for each child: SVGObjectPainter::PaintResourceSubtree()
    │       ├── canvas->concat(tile_transform)
    │       └── finishRecordingAsPicture() → PaintRecord
    └── Pattern::CreatePaintRecordPattern(record, tile_size)
            └── PaintRecordPattern
                    │ CreateShader() → PaintShader::MakePaintRecord(kRepeat, kRepeat)
                    │ ApplyToFlags()
                    ▼
                cc::PaintFlags::setShader(shader)  ← geometry's fill/stroke now tiles the pattern
```

---

## DOM Element and Attribute Collection

When the parser encounters `<pattern>`, it creates an `SVGPatternElement`.
The element creates its layout object:

```cpp
// svg_pattern_element.cc:171-173
LayoutObject* SVGPatternElement::CreateLayoutObject(const ComputedStyle&) {
  return MakeGarbageCollected<LayoutSVGResourcePattern>(this);
}
```

### Attribute Inheritance via xlink:href

Pattern attributes can be inherited through an `xlink:href` chain.
`CollectPatternAttributes()` walks the chain with cycle detection:

```cpp
// svg_pattern_element.cc:224-268
PatternAttributes SVGPatternElement::CollectPatternAttributes() const {
  HeapHashSet<Member<const SVGPatternElement>> processed_patterns;
  const SVGPatternElement* current = this;

  PatternAttributes attributes;
  while (true) {
    SetPatternAttributes(*current, attributes);
    processed_patterns.insert(current);

    current = current->ReferencedElement();
    if (!current || !current->GetLayoutObject())
      break;
    if (processed_patterns.Contains(current))
      break;  // cycle detection
  }
  // fill out defaults for unset fields ...
}
```

Each attribute is only set if not already specified (first-wins), implementing
the SVG spec's pattern attribute inheritance.

### PatternAttributes Value Object

The `PatternAttributes` struct holds the resolved values:

- `x`, `y`, `width`, `height` — `SVGLength` values for the tile rect
- `viewBox` — optional `gfx::RectF`
- `preserveAspectRatio` — `SVGPreserveAspectRatio`
- `patternUnits` — `SVGUnitTypes` (userSpaceOnUse or objectBoundingBox)
- `patternContentUnits` — `SVGUnitTypes`
- `patternTransform` — `AffineTransform`
- content element — the `SVGPatternElement` whose children define the tile

Source: `third_party/blink/renderer/core/svg/pattern_attributes.h`,
`third_party/blink/renderer/core/svg/svg_pattern_element.cc`

---

## Paint Resolution — How a Shape Gets Its Pattern Shader

When an SVG shape (e.g. `<rect fill="url(#myPattern)">`) is being painted,
`SVGObjectPainter::PreparePaint()` resolves the URL reference:

```cpp
// svg_object_painter.cc:19-42
bool ApplyPaintResource(
    const SvgContextPaints::ContextPaint& context_paint,
    const AffineTransform* additional_paint_server_transform,
    cc::PaintFlags& flags) {
  SVGElementResourceClient* client =
      SVGResources::GetClient(context_paint.object);
  auto* uri_resource = GetSVGResourceAsType<LayoutSVGResourcePaintServer>(
      *client, context_paint.paint.Resource());
  if (!uri_resource->ApplyShader(
          *client, SVGResources::ReferenceBoxForEffects(context_paint.object),
          additional_paint_server_transform, auto_dark_mode, flags)) {
    return false;
  }
  return true;
}
```

This calls `LayoutSVGResourcePattern::ApplyShader()`.

Source: `third_party/blink/renderer/core/paint/svg_object_painter.cc`

---

## ApplyShader — Per-Client Caching

```cpp
// layout_svg_resource_pattern.cc:178-201
bool LayoutSVGResourcePattern::ApplyShader(
    const SVGResourceClient& client,
    const gfx::RectF& reference_box,
    const AffineTransform* additional_transform,
    const AutoDarkMode&,
    cc::PaintFlags& flags) {
  std::unique_ptr<PatternData>& pattern_data =
      pattern_map_.insert(&client, nullptr).stored_value->value;
  if (!pattern_data)
    pattern_data = BuildPatternData(reference_box);

  if (!pattern_data->pattern)
    return false;

  AffineTransform transform = pattern_data->transform;
  if (additional_transform)
    transform = *additional_transform * transform;
  pattern_data->pattern->ApplyToFlags(flags, transform.ToSkMatrix());
  flags.setFilterQuality(cc::PaintFlags::FilterQuality::kLow);
  return true;
}
```

The `pattern_map_` is per-client because `patternUnits="objectBoundingBox"`
makes tile size relative to each client shape's bounding box, requiring a
different shader. The source notes this as an optimization opportunity:

```cpp
// layout_svg_resource_pattern.h:76-85
// FIXME: we can almost do away with this per-object map, but not quite: the
// tile size can be relative to the client bounding box, and it gets captured
// in the cached Pattern shader.
// Hence, we need one Pattern shader per client. The display list OTOH is the
// same => we should be able to cache a single display list per
// LayoutSVGResourcePattern + one Pattern(shader) for each client
```

### PatternData Struct

```cpp
// layout_svg_resource_pattern.cc:44-50
struct PatternData {
  USING_FAST_MALLOC(PatternData);
 public:
  scoped_refptr<Pattern> pattern;   // The tiling shader wrapper
  AffineTransform transform;        // Pattern-space to user-space transform
};
```

Source: `third_party/blink/renderer/core/layout/svg/layout_svg_resource_pattern.cc`

---

## BuildPatternData — Tile Metrics and Shader Construction

```cpp
// layout_svg_resource_pattern.cc:122-176
std::unique_ptr<PatternData> LayoutSVGResourcePattern::BuildPatternData(
    const gfx::RectF& object_bounding_box) {
  auto pattern_data = std::make_unique<PatternData>();
  const PatternAttributes& attributes = EnsureAttributes();

  if (!attributes.PatternContentElement())
    return pattern_data;

  // 1. Compute tile bounds
  gfx::RectF tile_bounds = ResolveRectangle(
      attributes.PatternUnits(), object_bounding_box, *attributes.X(),
      *attributes.Y(), *attributes.Width(), *attributes.Height());
  if (tile_bounds.IsEmpty())
    return pattern_data;

  // 2. Compute tile content transform
  AffineTransform tile_transform;
  if (attributes.HasViewBox()) {
    if (attributes.ViewBox().IsEmpty())
      return pattern_data;
    tile_transform = SVGFitToViewBox::ViewBoxToViewTransform(
        attributes.ViewBox(), attributes.PreserveAspectRatio(),
        tile_bounds.size());
  } else {
    if (attributes.PatternContentUnits() ==
        SVGUnitTypes::kSvgUnitTypeObjectboundingbox) {
      tile_transform.Scale(object_bounding_box.width(),
                           object_bounding_box.height());
    }
  }

  if (!attributes.PatternTransform().IsInvertible())
    return pattern_data;

  // 3. Record tile content and create pattern shader
  pattern_data->pattern = Pattern::CreatePaintRecordPattern(
      AsPaintRecord(tile_transform), gfx::RectF(tile_bounds.size()));

  // 4. Compose pattern-space-to-user-space transform
  pattern_data->transform.Translate(tile_bounds.x(), tile_bounds.y());
  pattern_data->transform.PostConcat(attributes.PatternTransform());

  return pattern_data;
}
```

Key observations:

- A `viewBox` overrides `patternContentUnits` per the SVG spec.
- If `patternContentUnits` is `objectBoundingBox` and there is no `viewBox`,
  the tile content is scaled by the client's bounding box dimensions.
- An uninvertible `patternTransform` causes the pattern to not paint (early return).
- The final pattern-space transform composes: translate to `(x, y)` of the tile,
  then apply `patternTransform`.

Source: `third_party/blink/renderer/core/layout/svg/layout_svg_resource_pattern.cc`

---

## AsPaintRecord — Recording Pattern Children

This is where the tile content is "painted" — but into a recording, not a
bitmap:

```cpp
// layout_svg_resource_pattern.cc:203-237
PaintRecord LayoutSVGResourcePattern::AsPaintRecord(
    const AffineTransform& tile_transform) const {
  PaintRecorder paint_recorder;
  cc::PaintCanvas* canvas = paint_recorder.beginRecording();

  auto* pattern_content_element = attributes_.PatternContentElement();
  const auto* pattern_layout_object = To<LayoutSVGResourceContainer>(
      pattern_content_element->GetLayoutObject());

  SubtreeContentTransformScope content_transform_scope(tile_transform);

  PaintRecordBuilder builder;
  for (LayoutObject* child = pattern_layout_object->FirstChild(); child;
       child = child->NextSibling()) {
    SVGObjectPainter(*child, nullptr).PaintResourceSubtree(builder.Context());
  }
  canvas->save();
  canvas->concat(tile_transform.ToSkM44());
  builder.EndRecording(*canvas);
  canvas->restore();
  return paint_recorder.finishRecordingAsPicture();
}
```

The recording mechanism:

1. A `PaintRecorder` captures paint operations into a `PaintRecord` (display
   list), **not a raster bitmap**.
2. `SubtreeContentTransformScope` sets a thread-local transform that descendant
   paint code reads for `patternContentUnits`/`viewBox` mapping.
3. Each child of the pattern content element is painted via
   `SVGObjectPainter::PaintResourceSubtree()`, which invokes the regular
   `Paint()` method with `PaintFlag::kPaintingResourceSubtree`.
4. The tile transform is baked into the recording via `canvas->concat()`.

Source: `third_party/blink/renderer/core/layout/svg/layout_svg_resource_pattern.cc`,
`third_party/blink/renderer/core/paint/svg_object_painter.cc`

---

## PaintRecordPattern — Creating the Tiling Shader

The recorded tile becomes a Skia tiling shader:

```cpp
// paint_record_pattern.cc:36-41
sk_sp<PaintShader> PaintRecordPattern::CreateShader(
    const SkMatrix& local_matrix) const {
  return PaintShader::MakePaintRecord(
      tile_record_, gfx::RectFToSkRect(tile_record_bounds_),
      SkTileMode::kRepeat, SkTileMode::kRepeat, &local_matrix);
}
```

This creates a `cc::PaintShader` of type `kPaintRecord` with repeat tiling in
both axes. The `local_matrix` encodes the composed pattern-space-to-user-space
transform (tile offset + `patternTransform` + any additional context transform).

The shader is applied to the geometry's paint flags:

```cpp
// pattern.cc:57-63
void Pattern::ApplyToFlags(cc::PaintFlags& flags,
                           const SkMatrix& local_matrix) const {
  if (!cached_shader_ || local_matrix != cached_shader_->GetLocalMatrix())
    cached_shader_ = CreateShader(local_matrix);
  flags.setShader(cached_shader_);
}
```

The shader is cached and reused as long as the local matrix does not change.

Source: `third_party/blink/renderer/platform/graphics/paint_record_pattern.cc`,
`third_party/blink/renderer/platform/graphics/pattern.cc`

---

## patternTransform Handling

The `patternTransform` attribute is applied entirely as a shader matrix. It
does not create a layer transform or affect the compositor tree. The composition
order is:

1. Translate to the tile origin `(tile_bounds.x, tile_bounds.y)`
2. Post-concatenate `patternTransform`
3. Pre-concatenate any additional context transform (from paint inheritance)

```cpp
// layout_svg_resource_pattern.cc:171-174
pattern_data->transform.Translate(tile_bounds.x(), tile_bounds.y());
pattern_data->transform.PostConcat(attributes.PatternTransform());

// layout_svg_resource_pattern.cc:195-197
AffineTransform transform = pattern_data->transform;
if (additional_transform)
  transform = *additional_transform * transform;
pattern_data->pattern->ApplyToFlags(flags, transform.ToSkMatrix());
```

This composed transform becomes the `local_matrix` of the `PaintShader`, which
Skia uses to position and transform the tiling grid in the coordinate space of
the filled geometry.

---

## Key Design Decisions

### 1. Vector recording, not bitmap

The tile is a `PaintRecord` (display list of paint ops, analogous to
`SkPicture`). Skia rasterizes it lazily at the appropriate resolution during
draw. Pattern content stays resolution-independent — zooming in does not
pixelate.

### 2. Per-client shader, shared display list (aspirational)

Because `patternUnits="objectBoundingBox"` makes tile size relative to the
client shape's bounding box, there is one `PatternData` (shader) per client
shape. The display list (recording) is the same across clients — the source
notes this could be optimized by caching the recording separately.

### 3. Pattern never creates compositor layers

`<pattern>` inherits from `LayoutSVGHiddenContainer`. It does not trigger any
of the `RenderSurfaceReason` conditions listed in
[render-surfaces.md](./render-surfaces.md). The pattern is purely a paint-time
operation resolved during `SVGObjectPainter::PreparePaint()`.

### 4. patternTransform is a shader matrix, not a layer transform

The transform is composed into the shader's `local_matrix`. This avoids
creating transform nodes in the property tree or render surfaces in the
compositor.

### 5. Pattern is a paint server, same category as gradients

`LayoutSVGResourcePattern` and `LayoutSVGResourceGradient` share the same base
class (`LayoutSVGResourcePaintServer`) and the same resolution path
(`ApplyShader()` → shader on `PaintFlags`). Patterns and gradients are treated
identically from the compositor's perspective — both are shaders attached to
draw calls.

---

## Source Files

| File                                                                            | Role                                                                |
| ------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| `third_party/blink/renderer/core/svg/svg_pattern_element.h`                     | DOM element class                                                   |
| `third_party/blink/renderer/core/svg/svg_pattern_element.cc`                    | Attribute collection, href chain resolution, layout object creation |
| `third_party/blink/renderer/core/svg/pattern_attributes.h`                      | Resolved attribute value object                                     |
| `third_party/blink/renderer/core/layout/svg/layout_svg_resource_pattern.h`      | Layout resource declaration, per-client cache map                   |
| `third_party/blink/renderer/core/layout/svg/layout_svg_resource_pattern.cc`     | **Core**: `BuildPatternData()`, `AsPaintRecord()`, `ApplyShader()`  |
| `third_party/blink/renderer/core/layout/svg/layout_svg_resource_paint_server.h` | Abstract base for paint servers (pattern + gradient)                |
| `third_party/blink/renderer/platform/graphics/pattern.h`                        | Platform `Pattern` abstraction wrapping `PaintShader`               |
| `third_party/blink/renderer/platform/graphics/pattern.cc`                       | `ApplyToFlags()` — sets shader on `cc::PaintFlags`                  |
| `third_party/blink/renderer/platform/graphics/paint_record_pattern.h`           | Concrete `Pattern` subclass for record-based tiling                 |
| `third_party/blink/renderer/platform/graphics/paint_record_pattern.cc`          | `CreateShader()` → `PaintShader::MakePaintRecord` with `kRepeat`    |
| `third_party/blink/renderer/core/paint/svg_object_painter.cc`                   | Paint resolution, `PaintResourceSubtree()` for pattern children     |
| `cc/paint/paint_shader.h`                                                       | Compositor-level shader, `MakePaintRecord()` entry point            |
