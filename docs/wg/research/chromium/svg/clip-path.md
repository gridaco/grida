---
title: "Chromium SVG clip-path"
tags:
  - internal
  - research
  - chromium
  - rendering
  - svg
---

# Chromium SVG `clip-path`

How Blink resolves and applies the `clip-path` property — both the SVG
`<clipPath>` element (a `url(#id)` reference) and the CSS basic-shape
forms (`circle()`, `inset()`, `polygon()`, `ellipse()`, `path()`) — with
side-by-side notes on usvg/resvg and the Skia primitives available via
`skia-safe`. Sister doc to
[resources-and-effects.md](./resources-and-effects.md), which covers the
broader resource-cache machinery shared by `<mask>`, `<filter>`, and
`<marker>`.

## Scope

In scope:

- The two strategies Blink uses to realize a `<clipPath>`: **path
  union** (preferred) and **mask raster** (fallback).
- All three `ClipPathOperation` subclasses: `ReferenceClipPathOperation`
  (`url(#id)`), `ShapeClipPathOperation` (CSS basic shapes), and
  `GeometryBoxClipPathOperation` (bare `border-box` etc.).
- `clipPathUnits` (`userSpaceOnUse` vs `objectBoundingBox`),
  `clip-rule`, `clip-path` chained on a clipPath child, and recursive
  cycle detection.
- CSS-side parsing and `<reference-box>` resolution for basic shapes.
- Where the clip is consumed (root, layer, container, text).

Out of scope:

- `<mask>` (covered in [resources-and-effects.md](./resources-and-effects.md)).
- Composited `clip-path` animations (`ClipPathPaintImageGenerator`).
- The `clip:` legacy property (deprecated; only valid on absolutely
  positioned elements; nothing to do with `<clipPath>`).

## Source files

### Chromium (Blink)

| File                                                 | Role                                                                                                                                                                                                                                   |
| ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `core/svg/svg_clip_path_element.{h,cc}`              | DOM element. Owns `clipPathUnits` (animated enum, default `userSpaceOnUse`). Inherits transform from `SVGTransformableElement`. Layout object is `LayoutSVGResourceClipper`.                                                           |
| `core/layout/svg/layout_svg_resource_clipper.{h,cc}` | The resource. Caches the unioned `Path` (`AsPath()`) and the `PaintRecord` for mask fallback (`CreatePaintRecord()`). Decides per-child `ClipStrategy::{kPath,kMask,kNone}`. Owns `FindCycleFromSelf()` for recursion detection.       |
| `core/style/clip_path_operation.h`                   | Abstract base + 3 enum kinds (`kReference`, `kShape`, `kGeometryBox`). One of these hangs off `ComputedStyle::ClipPath()` whenever `clip-path` is set.                                                                                 |
| `core/style/reference_clip_path_operation.{h,cc}`    | Holds `url_` (the original URL string) + `Member<SVGResource>` resource pointer. `IsLoading()` returns true while the external doc is fetching.                                                                                        |
| `core/style/shape_clip_path_operation.h`             | Holds `Member<const BasicShape> shape_` + `GeometryBox geometry_box_`. `GetPath(box, zoom, scale)` delegates to `shape_->GetPath(...)`.                                                                                                |
| `core/style/geometry_box_clip_path_operation.h`      | Holds just a `GeometryBox` enum — used when `clip-path` is just `border-box` / `view-box` etc. with no shape.                                                                                                                          |
| `core/style/basic_shapes.{h,cc}`                     | The five `BasicShape` subclasses (Circle, Ellipse, Polygon, Inset; the rest live elsewhere). Each implements `GetPath(bounding_box, zoom, path_scale) -> Path` directly using `Path::MakeEllipse` / `PathBuilder` / `MakeRoundedRect`. |
| `core/style/computed_style_constants.h`              | Defines `enum class GeometryBox { kBorderBox, kPaddingBox, kContentBox, kMarginBox, kFillBox, kStrokeBox, kViewBox, … }`.                                                                                                              |
| `core/css/properties/css_parsing_utils.cc`           | `ConsumeBasicShape`, `ConsumeBasicShapeCircle`, `ConsumeBasicShapePolygon`, `ConsumeBasicShapeInset`, `ConsumeBasicShapeEllipse`, `ConsumeBasicShapeRect`, `ConsumeBasicShapeXYWH`, `ConsumeShapeRadius`. The grammar entry points.    |
| `core/css/properties/longhands/longhands_custom.cc`  | `ClipPath::ParseSingleValue` (line 2286): the property-level entry. Tries `none`, `<url>`, `<basic-shape> <geometry-box>` in that order.                                                                                               |
| `core/css/css_basic_shape_values.cc`                 | The `CSSBasicShape*Value` AST classes, used during parse and serialize.                                                                                                                                                                |
| `core/css/basic_shape_functions.cc`                  | `BasicShapeForValue(state, css_value)` — converts a parsed CSS shape value into a style-tree `BasicShape*` instance during cascade.                                                                                                    |
| `core/paint/clip_path_clipper.{h,cc}`                | The application site. `ClipPathClipper::PathBasedClip` returns an optional `Path` to install via `GraphicsContext::ClipPath`; `PaintClipPathAsMaskImage` does the mask-image fallback.                                                 |
| `core/paint/svg_root_painter.cc`                     | Paints the root `<svg>` (`PaintReplaced`). Does **not** consult clip-path here — the clip is installed one level up by `PaintLayerPainter`.                                                                                            |
| `core/paint/paint_layer_painter.cc`                  | Where clip-path is installed for layered objects. Calls into `ClipPathClipper`.                                                                                                                                                        |
| `core/paint/svg_object_painter.cc`                   | Where clip-path is installed for non-layer SVG content (shapes, containers).                                                                                                                                                           |

### usvg / resvg (`Documents/Github/resvg/crates/usvg/`)

| File                                                       | Role                                                                                                                                                                                         |
| ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/parser/clippath.rs`                                   | `convert(node, state, object_bbox, cache) -> Option<Arc<ClipPath>>` — the only entry. Returns `None` for any invalid case (resolves the whole `clip-path` to "ignore" rather than clip-all). |
| `src/parser/converter.rs::convert_clip_path_elements`      | Walks `<clipPath>` children, filters by `is_graphic()` and visibility, recurses through `<g>`. Each child becomes a `Group` with its `transform=` baked in.                                  |
| `src/parser/converter.rs::convert_clip_path_elements_impl` | Shape branch (Rect/Circle/Ellipse/Polyline/Polygon/Path → `shapes::convert`) + Text branch (`text::convert` if `text` feature enabled). Anything else: `log::warn!`, skipped.                |
| `src/parser/shapes.rs`                                     | Per-shape geometry → `tiny_skia::Path`. The same parser used for normal shapes; clipPath children are baked through the same pipeline.                                                       |
| `src/parser/text.rs`                                       | When `<text>` appears inside `<clipPath>`, glyphs are shaped with rustybuzz, outlined with `ttf-parser`, and emitted as `Path` segments — i.e. text is baked to outline at parse time.       |
| `src/tree/mod.rs::ClipPath`                                | The resolved tree node: `id`, `transform`, `clip_path: Option<Arc<ClipPath>>` (nested chain, one link), `root: Group`. No `objectBoundingBox` enum — bbox baked into `transform`.            |

### CSS specs (cited inline)

- [CSS Shapes Module Level 1](https://drafts.csswg.org/css-shapes-1/) — basic-shape grammar.
- [CSS Masking Module Level 1](https://drafts.fxtf.org/css-masking-1/) — `clip-path` property, invalid-target fallback.
- SVG 1.1 §14.3 (Clipping) — historical; mostly subsumed by CSS Masking 1.
- SVG 2 §11.6 (clip-path on a `<clipPath>` element) — recursion.

## Architecture overview

### Two strategies for `<clipPath>` resources

Blink classifies every child of a `<clipPath>` into one of three
strategies (`enum class ClipStrategy { kNone, kMask, kPath }`,
`layout_svg_resource_clipper.cc:44`):

```cpp
ClipStrategy DetermineClipStrategy(const SVGGraphicsElement& element) {
  // ...display:none / visibility:hidden → kNone
  ClipStrategy strategy = ClipStrategy::kNone;
  if (layout_object->IsSVGShape()) {
    strategy = ClipStrategy::kPath;
  } else if (layout_object->IsSVGText()) {
    strategy = ClipStrategy::kMask;       // text always forces mask
  }
  return ModifyStrategyForClipPath(style, strategy);
}

ClipStrategy ModifyStrategyForClipPath(const ComputedStyle& style,
                                       ClipStrategy strategy) {
  // If a clip-path child has its own clip-path attribute, the path
  // strategy can't represent the intersection in one Path → upgrade to mask.
  if (strategy != ClipStrategy::kPath || !style.HasClipPath())
    return strategy;
  return ClipStrategy::kMask;
}
```

The whole `<clipPath>` resource is a path-strategy clip if **every**
contributing child is path-strategy; if any single child is
`kMask`, `AsPath()` returns `std::nullopt` and `PathBasedClip()`
falls through to `PaintClipPathAsMaskImage()`. There is a third
short-circuit: `op_count > 42` (a hard cap on `SkOpBuilder` ops to
avoid quadratic Skia path-ops behavior).

```
clipPath resource
  ├─ child 1: <rect>            → kPath
  ├─ child 2: <circle>          → kPath
  └─ child 3: <text>            → kMask  ← whole resource downgrades to mask
```

### Three kinds of `ClipPathOperation`

Independent of the resource side, the **referencing element**'s
`ComputedStyle.ClipPath()` always returns one of three subclasses:

```cpp
enum OperationType { kReference, kShape, kGeometryBox };
```

- `ReferenceClipPathOperation` — `clip-path: url(#id)`. Resolved at
  paint time via `SVGResource` machinery; loading state is observable.
- `ShapeClipPathOperation` — `clip-path: circle(50%) padding-box`.
  Holds a `BasicShape` + a `GeometryBox`. Always path-strategy.
- `GeometryBoxClipPathOperation` — `clip-path: border-box` (no shape,
  just the box). Holds only a `GeometryBox`. Always path-strategy.

The path-strategy applies `GraphicsContext::ClipPath(skpath,
kAntiAliased)`. The mask-strategy renders the resource into an
intermediate layer with `SkBlendMode::kDstIn` against the content.
Both use anti-aliased clipping by default (Skia's `kAntiAliased`).

### High-level dispatch (`ClipPathClipper::PathBasedClip`)

```cpp
std::optional<Path> ClipPathClipper::PathBasedClip(...) {
  switch (clip_path.GetType()) {
    case kShape:           return ShapeOperation->GetPath(...).Translate(offset);
    case kGeometryBox:     return RoundedReferenceBox(...).GetPath();
    case kReference: {
      auto* clipper = ResolveElementReference(...);
      if (!clipper) return std::nullopt;       // invalid → fallback
      return clipper->AsPath();                 // path strategy or std::nullopt → mask
    }
  }
}
```

If `PathBasedClip` returns `std::nullopt`, Blink installs a paint
property node `properties->ClipPathMask()` and emits a
`PaintClipPathAsMaskImage` display item that draws the resource into
a mask image and composites it with `kDstIn`.

## `<clipPath>` element resource

### Children that contribute

`DetermineClipStrategy()` decides what counts:

- `LayoutSVGShape` (rect / circle / ellipse / line / polygon /
  polyline / path) → `kPath`.
- `LayoutSVGText` → `kMask` (and forces the whole resource to mask).
- `<use>` whose target is one of the above
  (`SVGUseElement::VisibleTargetGraphicsElementForClipping`) → same
  strategy as the target.
- Anything else (`<g>`, `<image>`, `<svg>`, `<defs>`, comments, text
  nodes, unknown elements) → `kNone`. `<g>` children of `<clipPath>`
  are **not** walked; per the spec the path strategy ignores them
  silently. (This differs from usvg, which descends into `<g>`.)

### `AsPath()` — the union builder

Verbatim from `layout_svg_resource_clipper.cc` (lines 131–176):

```cpp
std::optional<Path> LayoutSVGResourceClipper::AsPath() {
  // ... cache check ...
  unsigned op_count = 0;
  std::optional<SkOpBuilder> clip_path_builder;
  SkPath resolved_path;
  for (const SVGElement& child_element :
       Traversal<SVGElement>::ChildrenOf(*GetElement())) {
    ClipStrategy strategy = DetermineClipStrategy(child_element);
    if (strategy == ClipStrategy::kNone)  continue;
    if (strategy == ClipStrategy::kMask)  return std::nullopt;
    const unsigned kMaxOps = 42;
    if (++op_count > kMaxOps) return std::nullopt;
    if (clip_path_builder) {
      clip_path_builder->add(PathFromElement(child_element).GetSkPath(),
                             kUnion_SkPathOp);
    } else if (resolved_path.isEmpty()) {
      resolved_path = PathFromElement(child_element).GetSkPath();
    } else {
      clip_path_builder.emplace();
      clip_path_builder->add(std::move(resolved_path), kUnion_SkPathOp);
      clip_path_builder->add(PathFromElement(child_element).GetSkPath(),
                             kUnion_SkPathOp);
    }
  }
  if (clip_path_builder) clip_path_builder->resolve(&resolved_path);
  // ... cache + return ...
}
```

Notes:

- The first child path is taken as-is; the second child triggers
  promotion to an `SkOpBuilder`. This avoids paying for path-ops
  when there's only one shape.
- `PathFromElement(child)` calls `geometry_element->ToClipPath()` —
  which respects the **child's `clip-rule`** when constructing the
  per-shape `SkPath` fill type. (Blink reads `clip-rule` from
  `ComputedStyle` of the child during `ToClipPath()`.)
- The `kMaxOps = 42` cap is a real ceiling — large clipPaths
  (>42 shapes) silently downgrade to mask. Quadratic Skia path-ops
  behavior on degenerate inputs.

### `clip-rule` cascade

`clip-rule: evenodd | nonzero` is a presentation property. Blink
reads it from the **child's** `ComputedStyle`, not from the
`<clipPath>` element. The cascade follows normal CSS inheritance: an
attribute on `<clipPath>` will reach the child via inheritance (it's
inherited per spec); an attribute directly on the child wins.

`clip-rule` modifies the `SkPath::FillType` of the per-child shape
_before_ it goes into the union. Once the union is computed, the
final `SkPath` has a single fill type — but because each child's
shape is fed through `SkOpBuilder::add(path, kUnion_SkPathOp)` with
its own fill type, the union "respects" each child's rule.

### `<g>` inside `<clipPath>` — Blink's actual behavior

Blink's `Traversal<SVGElement>::ChildrenOf(*GetElement())` only
walks **direct children** — it does not descend into a `<g>`. A
`<g>` child therefore contributes `kNone` (it's not an `SVGShape`
or `SVGText`) and is silently dropped.

This contradicts what most authors expect: SVG 2 §14.3.5 lists
`<g>` as a valid `clipPath` child whose contents should clip. usvg
**does** descend into `<g>` (`convert_clip_path_elements` in
`converter.rs` recurses).

### `clipPathUnits` and `transform=`

```cpp
AffineTransform LayoutSVGResourceClipper::CalculateClipTransform(
    const gfx::RectF& reference_box) const {
  AffineTransform transform =
      element->CalculateTransform(SVGElement::kIncludeMotionTransform);
  if (ClipPathUnits() == kSvgUnitTypeObjectboundingbox) {
    transform.Translate(reference_box.x(), reference_box.y());
    transform.ScaleNonUniform(reference_box.width(), reference_box.height());
  }
  return transform;
}
```

The `<clipPath>`'s own `transform=` is applied **first** (in clip
content space), then the bbox map is applied on top for
`objectBoundingBox` mode. usvg applies them in the opposite order
(transform after bbox map). This matters when a clipper has both
`clipPathUnits="objectBoundingBox"` and a non-trivial `transform=`;
in practice most fixtures only use one or the other.

### Dead-`<defs>` / hidden subtrees

`SVGClipPathElement::CreateLayoutObject` returns
`LayoutSVGResourceClipper`, which is a `LayoutSVGResourceContainer`
— a **hidden** layout object. It participates in style and layout
but never paints from its own subtree; it only emits paint records
when `CreatePaintRecord()` is called from the mask path. Children
inherit normal style cascade.

## `clip-path` property — reference (`url()`)

### Resolution

`ReferenceClipPathOperation` holds:

```cpp
AtomicString url_;             // "url(#id)" or "url('http://other.svg#id')"
Member<SVGResource> resource_; // resolved at style time
```

At paint, `ResolveElementReference()` (in `clip_path_clipper.cc`):

```cpp
LayoutSVGResourceClipper* ResolveElementReference(
    const LayoutObject& object,
    const ReferenceClipPathOperation& reference_clip_path_operation) {
  SVGResourceClient* client = GetResourceClient(object);
  if (!client) return nullptr;
  LayoutSVGResourceClipper* resource_clipper =
      GetSVGResourceAsType(*client, reference_clip_path_operation);
  if (!resource_clipper) return nullptr;
  // ...display-lock check, layout sanity check...
  return resource_clipper;
}
```

`GetSVGResourceAsType<LayoutSVGResourceClipper>` returns null if:

- the URL has no in-document target,
- the target exists but is **not** a `<clipPath>` element
  (`DowncastTraits<LayoutSVGResourceClipper>::AllowFrom` checks
  `ResourceType() == kClipperResourceType`),
- the target is in a different document and external references are
  disabled (default in standalone SVG-as-image).

### Invalid-target fallback (the spec calls this "invalid value")

Both SVG and CSS Masking are explicit: an invalid `clip-path`
reference behaves as `clip-path: none`. Quoting CSS Masking 1
[§5.1](https://drafts.fxtf.org/css-masking-1/#the-clip-path):

> If the URI reference is not valid (e.g. it points to an object that
> doesn't exist or doesn't reference a `clipPath` element), the
> `clip-path` property MUST be treated as if no clipping was applied.

Blink implements this in `PathBasedClip` by returning `std::nullopt`
when `ResolveElementReference` fails, and the layer painter then
**skips** clip installation entirely (no clip → element renders
unclipped, fully visible).

```cpp
LayoutSVGResourceClipper* resource_clipper =
    ResolveElementReference(clip_path_owner, reference_clip);
if (!resource_clipper) return std::nullopt;   // → no clip installed
```

Distinct cases, all behaving the same way:

| Case                                                       | Blink behavior          | Spec citation                   |
| ---------------------------------------------------------- | ----------------------- | ------------------------------- |
| `clip-path: url(#missing)`                                 | render unclipped        | CSS Masking 1 §5.1              |
| `clip-path: url(#existing-non-clipPath)` (e.g. a `<rect>`) | render unclipped        | CSS Masking 1 §5.1              |
| `clip-path: url(#empty-clipPath)` (no children)            | **clip away**           | SVG 2 §14.3.5 (empty union)     |
| `clip-path: url(#all-children-display-none)`               | **clip away**           | same; no `kPath` contributors   |
| Loading external doc                                       | empty bbox; no clip yet | `IsLoading()` returns `RectF()` |

The third case is the only "trap" — an empty `<clipPath>` is _valid_,
just clips everything to nothing. Blink's `AsPath()` returns
`std::optional<Path>(empty path)` (line 174); applying that with
`ClipOp::Intersect` produces an empty draw region. usvg differs:
`if !clip.root.has_children() return None`, which collapses it to
"no clip" (unclipped).

## `clip-path` property — basic shapes

### Grammar (CSS Shapes Level 1)

From [css-shapes-1 §3.1](https://drafts.csswg.org/css-shapes-1/#supported-basic-shapes):

```
<basic-shape>     = <inset()> | <circle()> | <ellipse()> | <polygon()> | <path()>
<inset()>         = inset( <length-percentage>{1,4} [round <'border-radius'>]? )
<circle()>        = circle( <shape-radius>? [at <position>]? )
<ellipse()>       = ellipse( [<shape-radius>{2}]? [at <position>]? )
<polygon()>       = polygon( <'fill-rule'>? , [ <length-percentage> <length-percentage> ]# )
<path()>          = path( <'fill-rule'>?, <string> )
<shape-radius>    = <length-percentage> | closest-side | farthest-side
```

For `clip-path` specifically (CSS Masking 1 §5.1):

```
clip-path: none | <clip-source> | [ <basic-shape> || <geometry-box> ]
<clip-source>     = <url>
<geometry-box>    = <shape-box> | fill-box | stroke-box | view-box
<shape-box>       = <visual-box> | margin-box
<visual-box>      = content-box | padding-box | border-box
```

Per-shape Blink parser entry (`css_parsing_utils.cc`):

```cpp
// circle( [<shape-radius>]? [at <position>]? )
ConsumeBasicShapeCircle(args, context, local_context);
// ellipse( [<shape-radius>{2}]? [at <position>]? )
ConsumeBasicShapeEllipse(args, context, local_context);
// polygon( <fill-rule>? round <length>?, <x> <y>{2,} )
ConsumeBasicShapePolygon(args, context, local_context);
// inset( <length>{1,4} [round <border-radius>]? )
ConsumeBasicShapeInset(args, context, local_context);
```

`ClipPath::ParseSingleValue`
(`longhands_custom.cc:2286`) wraps these:

```cpp
const CSSValue* ClipPath::ParseSingleValue(stream, context, local_context) {
  if (peek == kNone)   return ConsumeIdent(stream);
  if (auto* url = ConsumeUrl(stream, context)) return url;
  CSSValue* geometry_box = ConsumeGeometryBox(stream);
  CSSValue* basic_shape  = ConsumeBasicShape(stream, context, local_context);
  if (basic_shape && !geometry_box) geometry_box = ConsumeGeometryBox(stream);
  // returns CSSValueList: [shape, box?] (box omitted when default)
}
```

The geometry-box keyword can come **before or after** the shape
function (`circle(50%) padding-box` ≡ `padding-box circle(50%)`).
Default geometry-box is `border-box` for HTML, but `fill-box` for
SVG (forced in `CalcLocalReferenceBox`, see below).

### Shape → Path construction

Each `BasicShape*` subclass implements
`Path GetPath(bounding_box, zoom, path_scale) const`. From
`basic_shapes.cc`:

#### `circle()`

```cpp
Path BasicShapeCircle::GetPath(const gfx::RectF& bounding_box, ...) const {
  const gfx::PointF center =
      PointForCenterCoordinate(center_x_, center_y_, bounding_box.size());
  const float radius = FloatValueForRadiusInBox(center, bounding_box.size())
                       * path_scale;
  return Path::MakeEllipse(scaled_center, radius, radius);
}

float BasicShapeCircle::FloatValueForRadiusInBox(center, box_size) const {
  if (radius_.GetType() == BasicShapeRadius::kValue) {
    // <length-percentage>: percentages resolve against
    // sqrt((W² + H²) / 2)  (the spec's "resolution diagonal")
    return FloatValueForLength(radius_.Value(),
                               hypotf(box.width, box.height) / sqrtf(2));
  }
  if (radius_.GetType() == kClosestSide) {
    return min(min(|cx|, |W - cx|), min(|cy|, |H - cy|));
  }
  // kFarthestSide
  return max(max(cx, |W - cx|), max(cy, |H - cy|));
}
```

Skia equivalent: `PathBuilder::add_circle((cx, cy), r, None)` (or
the `add_oval` form with equal radii). `Path::MakeEllipse` is
Blink's wrapper around Skia's `addOval`.

The percentage resolution for radius (`hypot(W,H) / sqrt(2)`) is a
**spec gotcha**: a percentage doesn't mean "% of width" — it's
%-of-the-square-with-equal-area-to-the-box-rotated-45°.

#### `ellipse()`

```cpp
Path BasicShapeEllipse::GetPath(const gfx::RectF& bounding_box, ...) const {
  // Same center calc as circle.
  // rx resolves against bounding_box.width, ry against height (no diagonal trick).
  const gfx::Vector2dF radii = {
      FloatValueForRadiusInBox(radius_x_, center.x(), box.width),
      FloatValueForRadiusInBox(radius_y_, center.y(), box.height),
  };
  return Path::MakeEllipse(scaled_center, radii.x(), radii.y());
}
```

Skia: `PathBuilder::add_oval(Rect::from_xywh(cx-rx, cy-ry, 2*rx, 2*ry))`.

#### `inset()`

```cpp
Path BasicShapeInset::GetPath(const gfx::RectF& bounding_box, ...) const {
  const float left = FloatValueForLength(left_, box.width);
  const float top  = FloatValueForLength(top_,  box.height);
  // ... rect = box minus left/top/right/bottom insets, clamped to >= 0 ...
  FloatRoundedRect final_rect(scaled_rect, scaled_radii);
  final_rect.ConstrainRadii();   // shrink radii so opposing corners don't overlap
  return Path::MakeRoundedRect(final_rect);
}
```

Skia: `PathBuilder::add_rect(rect, ...)` if all radii are zero,
otherwise build an `RRect::set_rect_radii(rect, &[tl, tr, br, bl])`
and `add_rrect`. Blink's `ConstrainRadii` is non-trivial — it
shrinks any radii whose pair-sum exceeds the corresponding edge
length (CSS3-Backgrounds border-radius constraint).

#### `polygon()`

```cpp
Path BasicShapePolygon::GetPath(const gfx::RectF& bounding_box, ...) const {
  // values_ is Vector<Length> stored as [x0, y0, x1, y1, ...].
  // Each x resolves against box.width, y against box.height.
  // Open-coded:
  builder.MoveTo(points.front());
  for (...) builder.LineTo(points[i]);
  builder.Close();
  builder.SetWindRule(wind_rule_);   // RULE_NONZERO | RULE_EVENODD
  return builder.Finalize();
}
```

If `polygon(round 12px, ...)` is used (CSS Polygon Rounding
behind a flag), the builder uses `ArcTo` between segments using
the spec's `tan(interior/2)` clamp.

Skia: `PathBuilder::move_to(...)` + `line_to(...)` + `close()`.
There is also a `PathBuilder::add_poly(&[Point], close)` shortcut,
but Blink doesn't use it — they hand-roll moveTo/lineTo so they
can mix in arc segments for the rounding case.

#### `path()`

`path("M0 0 L100 100 Z")` re-uses the SVG path-data parser.

### Reference-box resolution (`<geometry-box>`)

```cpp
// clip_path_clipper.cc:400
gfx::RectF ClipPathClipper::LocalReferenceBox(const LayoutObject& object) {
  ClipPathOperation* clip_path = object.StyleRef().ClipPath();
  GeometryBox geometry_box = GeometryBox::kBorderBox;          // HTML default
  if (auto* shape = DynamicTo<ShapeClipPathOperation>(clip_path))
    geometry_box = shape->GetGeometryBox();
  else if (auto* box = DynamicTo<GeometryBoxClipPathOperation>(clip_path))
    geometry_box = box->GetGeometryBox();
  return CalcLocalReferenceBox(object, clip_path->GetType(), geometry_box);
}

gfx::RectF CalcLocalReferenceBox(...) {
  if (object.IsSVGChild()) {
    // SVG override: url(#id) ALWAYS uses fill-box, regardless of cascaded box.
    if (clip_path_operation == ClipPathOperation::kReference)
      geometry_box = GeometryBox::kFillBox;
    return SVGResources::ReferenceBoxForEffects(object, geometry_box, ...);
  }
  // HTML path: border-box rect + outset/inset for content/padding/margin.
  return BorderBoxRect(object) + ReferenceBoxBorderBoxOutsets(geometry_box, box);
}
```

`SVGResources::ReferenceBoxForEffects` returns:

| `geometry_box`               | SVG bbox                                           |
| ---------------------------- | -------------------------------------------------- |
| `kFillBox` (default for SVG) | element's object bounding box (fill geometry only) |
| `kStrokeBox`                 | object bounding box expanded by stroke-width       |
| `kViewBox`                   | nearest viewport's viewBox rect                    |
| `kBorderBox`/etc.            | falls back to fill-box for SVG (no border in SVG)  |

Only `<foreignObject>` honors HTML-style `border-box` etc. (its
`UsesZoomedReferenceBox` check returns true).

### `path()` percentages — **none**

Unlike the other basic shapes, `path()` has no `<length-percentage>`
— the path data is in user-space coordinates with no implicit
reference box. The `geometry-box` keyword still applies if specified
(it sets the reference box for the _clip_, not the path data),
but in practice it has no effect on `path()`.

## Application sites

### Where `clip-path` is consumed

| Caller                                   | When                                                                  | Code                                                                                                                                                                            |
| ---------------------------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PaintLayerPainter::PaintLayer`          | Element has its own `PaintLayer` (e.g. `<svg>` root, opacity, filter) | Installs the clip via paint property nodes set up in PrePaint. The display item is `kSVGClip` for the mask path; for path-strategy it's a `BeginClipPath` / `EndClipPath` pair. |
| `SVGObjectPainter::PaintResource`        | Plain SVG content (shapes, containers) without their own layer        | Same path-strategy via `ClipPathClipper::PathBasedClip` consulted by the property tree.                                                                                         |
| `BoxModelObjectPainter`                  | HTML elements with `clip-path: ...`                                   | Same machinery; reference box is border-box-derived.                                                                                                                            |
| `SVGTextPainter` / `TextFragmentPainter` | `<text>` element with `clip-path` set                                 | Same path. Text has no `PaintLayer` of its own, so this goes through the SVG object painter.                                                                                    |

### Root `<svg>`

`SVGRootPainter::PaintReplaced` (line 63 of `svg_root_painter.cc`)
does **not** consult `clip-path` directly. The root `<svg>` is a
replaced element from the HTML side: it has its own `PaintLayer`,
and `PaintLayerPainter` installs the clip _before_ descending into
`PaintReplaced`. From the SVG renderer's perspective, the clip is
an opaque pre-installed transform on the canvas state.

Mechanically:

```
PaintLayerPainter::PaintWithPhase(layer)
  ├─ Install paint property tree node for clip-path
  │    via ClipPathClipper::PathBasedClip(root_object, offset)
  │      reference_box = border-box rect of the <svg> in CSS pixels
  │      shape path is computed in CSS-pixel space, then translated by
  │      paint_offset to land in canvas-pixel space
  │    the clip is in CSS-pixel coords (zoomed)
  └─ SVGRootPainter::PaintReplaced(...)
       ↳ each SVG child paints normally; the clip is already active
```

Key facts:

- The reference box for `clip-path` on `<svg>` is the `<svg>`'s
  **CSS border-box** (HTML side), **not** the viewBox. This is
  why `clip-path: circle(50%)` on `<svg width="200" height="100">`
  draws a circle of radius 100px (half the diagonal divided by
  √2), not the SVG-internal viewBox half-diagonal.
- The clip is in canvas-pixel coords (zoomed). `UsesZoomedReferenceBox`
  returns true for the root because `IsSVGChild()` is false on
  `LayoutSVGRoot`.
- The viewBox transform (`LocalToBorderBoxTransform`) is applied
  _inside_ `PaintReplaced`, after the clip is already installed —
  so the clip is "outside" the viewBox.

### `<text>`

A `clip-path` on a `<text>` element follows the same path as on a
container: `ClipPathClipper::PathBasedClip` is consulted before
the text paints. The reference box for `objectBoundingBox` is the
text's **glyph union bounding box** (per
`SVGResources::ReferenceBoxForEffects`), not the inline-box rect.
Per character/glyph clipping is **not** supported — the clip is
applied uniformly to the whole `<text>` element's draw call.

`LocalClipPathBoundingBox` returns `std::nullopt` for text:

```cpp
std::optional<gfx::RectF> ClipPathClipper::LocalClipPathBoundingBox(
    const LayoutObject& object) {
  if (object.IsText() || !object.StyleRef().HasClipPath())
    return std::nullopt;   // text bbox computed elsewhere
  ...
}
```

This is just a bbox-cache opt-out, not a behavioral skip. The clip
still installs.

## Recursion + chaining

### Direct or indirect cycle

SVG 2 §11.6 (`clip-path` on a clipPath element):

> When a `clip-path` references itself directly or indirectly, the
> entire reference is treated as if it were not specified.

Blink detects cycles via `LayoutSVGResourceContainer::FindCycle`,
which is called from `LayoutSVGResourceClipper::FindCycleFromSelf`:

```cpp
bool LayoutSVGResourceClipper::FindCycleFromSelf() const {
  if (auto* reference_clip =
          DynamicTo<ReferenceClipPathOperation>(StyleRef().ClipPath())) {
    if (SVGResource* resource = reference_clip->Resource()) {
      if (resource->FindCycle(*SVGResources::GetClient(*this)))
        return true;
    }
  }
  return LayoutSVGResourceContainer::FindCycleFromSelf();
}
```

The base `FindCycle` walks the resource graph (gradients, patterns,
clipPaths, masks, filters) using a visited set. Each resource type
overrides `FindCycleFromSelf` to add its own potential edges. When
a cycle is detected, the resource's `IsCyclic()` flag becomes true
and `ResolveElementReference` returns null — same path as
"missing target", so the clip is treated as `none`.

### Chained `clip-path` on a clipPath child

Two distinct cases:

1. **`clip-path` attribute on the `<clipPath>` element itself**
   (`clip-path` chained on the clipper). Blink detects this via
   `style.HasClipPath()` and forces the strategy to mask
   (`ModifyStrategyForClipPath`). The mask path then composes the
   nested clip via `BeginLayer(SkBlendMode::kDstIn)` —
   `PaintClipPathAsMaskImage` walks `current_object = resource_clipper`
   in a loop:

   ```cpp
   while (current_object) {
     auto* reference_clip =
         To<ReferenceClipPathOperation>(current_object->StyleRef().ClipPath());
     // ... begin layer with kDstIn for second+ iteration ...
     if (resource_clipper->StyleRef().HasClipPath()) {
       if (auto path = PathBasedClipInternal(*resource_clipper, ...)) {
         context.ClipPath(path->GetSkPath(), kAntiAliased);
         rest_of_the_chain_already_appled = true;
       }
     }
     context.ConcatCTM(MaskToContentTransform(...));
     context.DrawRecord(resource_clipper->CreatePaintRecord());
     current_object = resource_clipper;
   }
   ```

   The `ClipPathNestedRasterOptimizationEnabled` flag (default on
   in recent Chromium) enables a path-only optimization:
   `PathBasedClipInternal` recursively builds the nested clip and
   composes via `SkPath::Op(..., kIntersect_SkPathOp, ...)`:

   ```cpp
   if (resource_clipper->StyleRef().HasClipPath()) {
     std::optional<Path> nested_clip = PathBasedClipInternal(...);
     if (!nested_clip) return std::nullopt;
     // Cap at 500 verbs to avoid O(N²) Skia path-ops blowup.
     if (path->countVerbs() + nested_clip->countVerbs() > 500)
       return std::nullopt;
     SkPath clipped_path;
     if (!Op(path->GetSkPath(), nested_clip->GetSkPath(),
             kIntersect_SkPathOp, &clipped_path))
       return std::nullopt;
     path = Path(clipped_path);
   }
   ```

   With this optimization, nested clipPaths stay path-strategy and
   avoid the mask-layer cost.

2. **`clip-path` attribute on a `<clipPath>`'s child** (e.g.
   `<clipPath><rect clip-path="url(#other)"/></clipPath>`). This
   also forces the parent `<clipPath>` to mask strategy
   (`DetermineClipStrategy` → `ModifyStrategyForClipPath`
   upgrades the child's `kPath` to `kMask`). The mask path then
   paints the child into the mask buffer with its own clip
   installed — automatic, no special logic.

resvg ignores the chained reference rather than switching to mask
strategy.

## Pixel-coord nuances

### `userSpaceOnUse` vs `objectBoundingBox` for clipper content

```cpp
// clip_path_clipper.cc::MaskToContentTransform
AffineTransform MaskToContentTransform(clipper, reference_box, owner) {
  AffineTransform mask_to_content;
  if (clipper.ClipPathUnits() == kSvgUnitTypeUserspaceonuse) {
    if (UsesZoomedReferenceBox(owner)) {
      if (UsesPaintOffset(owner))
        mask_to_content.Translate(reference_box.x(), reference_box.y());
      mask_to_content.Scale(owner.StyleRef().EffectiveZoom());
    }
  }
  // For objectBoundingBox, the bbox map is folded into CalculateClipTransform.
  mask_to_content.PreConcat(clipper.CalculateClipTransform(reference_box));
  return mask_to_content;
}
```

For SVG content (`UsesZoomedReferenceBox` is false), there is no
zoom or paint-offset adjustment — the clipper's child paths are
already in user space. The only transform is `CalculateClipTransform`
which handles the bbox map for `objectBoundingBox`.

### Reference box for `objectBoundingBox` ON a `<text>`

Per `SVGResources::ReferenceBoxForEffects(text, kFillBox, ...)` —
the text's **glyph union** bounding box, computed by
`LayoutSVGText::ObjectBoundingBox()`. Inline-box advance widths are
ignored (they reflect text-anchor, not glyph extent). For
`objectBoundingBox` clipping, the `[0,1]²` square maps onto this
glyph-union bbox.

### The `Path::BoundingRect()` clamp

`LocalClipPathBoundingBox` clamps the result to `InfiniteIntRect()`
to avoid floating-point overflow downstream.

## See also

- Resource cache machinery and invalidation: [resources-and-effects.md](./resources-and-effects.md).
- `<use>` resolution (used for clipPath children): [use-and-foreign-object.md](./use-and-foreign-object.md).
- Path building from `d=` (used by `path()`): [path-geometry.md](./path-geometry.md).
- SVG text shaping: [text.md](./text.md).
- Coordinate spaces (zoom, viewBox, paint-offset): [coordinate-systems.md](./coordinate-systems.md).
