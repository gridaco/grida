---
title: "Chromium SVG Hit Testing"
tags:
  - internal
  - research
  - chromium
  - rendering
  - svg
---

# Chromium SVG Hit Testing

How Blink resolves a point in SVG space to an element. Different from HTML
box hit-testing because shapes are paths, not rectangles, and `pointer-events`
in SVG has many more values than CSS.

## Algorithm

For an input point `p` in the host SVG's user space:

1. Walk the SVG layout subtree in **reverse paint order** (z-index, then
   reverse document order within a stacking context).
2. At each `LayoutSVGShape`:
   - Check `pointer-events` rules — skip if this element can't be hit at all.
   - Transform `p` into the shape's local coordinate space.
   - Apply `clip-path` if any (`ClipPathClipper::HitTest`).
   - Test against the shape's `Path::Contains(p)` honoring
     `clip-rule` / `fill-rule` (for fill sensitivity) and / or stroke
     widening (for stroke sensitivity).
3. First hit wins — recursion bubbles back up.

```cpp
// third_party/blink/renderer/core/layout/svg/layout_svg_shape.cc
bool LayoutSVGShape::NodeAtPointInternal(HitTestResult& result,
                                         const HitTestLocation& hit_test_location,
                                         const PhysicalOffset& accumulated_offset,
                                         HitTestPhase phase) {
  if (phase != HitTestPhase::kForeground) return false;
  if (IsShapeEmpty()) return false;

  const ComputedStyle& style = StyleRef();
  const PointerEventsHitRules hit_rules(
      PointerEventsHitRules::kSvgGeometryHitTesting,
      result.GetHitTestRequest(),
      style.UsedPointerEvents());

  if (hit_rules.require_visible &&
      style.Visibility() != EVisibility::kVisible) {
    return false;
  }

  TransformedHitTestLocation local_location(hit_test_location,
                                            LocalToSVGParentTransform());
  if (!local_location) return false;
  if (HasClipPath() && !ClipPathClipper::HitTest(*this, *local_location)) {
    return false;
  }

  if (HitTestShape(result.GetHitTestRequest(), *local_location, hit_rules)) {
    UpdateHitTestResult(result, ...);
    return result.AddNodeToListBasedTestResult(GetElement(), *local_location)
           == kStopHitTesting;
  }
  return false;
}
```

The shape's actual hit logic:

```cpp
bool LayoutSVGShape::HitTestShape(const HitTestRequest& request,
                                  const HitTestLocation& local_location,
                                  PointerEventsHitRules hit_rules) {
  if (hit_rules.can_hit_bounding_box &&
      local_location.Intersects(ObjectBoundingBox()))
    return true;

  const ComputedStyle& style = StyleRef();
  if (hit_rules.can_hit_stroke &&
      (style.HasStroke() || !hit_rules.require_stroke) &&
      StrokeContains(local_location, hit_rules.require_stroke))
    return true;

  WindRule fill_rule = style.FillRule();
  if (request.SvgClipContent())
    fill_rule = style.ClipRule();
  if (hit_rules.can_hit_fill && (style.HasFill() || !hit_rules.require_fill) &&
      FillContains(local_location, hit_rules.require_fill, fill_rule))
    return true;

  return false;
}
```

`FillContains` calls into the platform `Path::Contains` (Skia
`SkPath::contains` underneath) with the proper fill rule. `StrokeContains`
widens the path by the stroke width before testing — implemented via
`SkPath::getFillPath` with a `SkStrokeRec`.

## `pointer-events`: the rules table

SVG's `pointer-events` property has many more values than CSS. They're
encoded in `PointerEventsHitRules`:

```cpp
// third_party/blink/renderer/core/layout/pointer_events_hit_rules.h
class PointerEventsHitRules {
 public:
  enum EHitTesting {
    kSvgImageHitTesting,
    kSvgGeometryHitTesting,
    kSvgTextHitTesting,
  };

  PointerEventsHitRules(EHitTesting, const HitTestRequest&, EPointerEvents);

  unsigned require_visible : 1;
  unsigned require_fill : 1;
  unsigned require_stroke : 1;
  unsigned can_hit_stroke : 1;
  unsigned can_hit_fill : 1;
  unsigned can_hit_bounding_box : 1;
};
```

Mapping (for `kSvgGeometryHitTesting`):

| `pointer-events`           | require visible | can hit fill | can hit stroke | require fill         | require stroke       | bbox |
| -------------------------- | --------------- | ------------ | -------------- | -------------------- | -------------------- | ---- |
| `visiblePainted` (default) | ✓               | ✓            | ✓              | ✓ (paint must exist) | ✓ (paint must exist) | –    |
| `visibleFill`              | ✓               | ✓            | –              | –                    | –                    | –    |
| `visibleStroke`            | ✓               | –            | ✓              | –                    | –                    | –    |
| `visible`                  | ✓               | ✓            | ✓              | –                    | –                    | –    |
| `painted`                  | –               | ✓            | ✓              | ✓                    | ✓                    | –    |
| `fill`                     | –               | ✓            | –              | –                    | –                    | –    |
| `stroke`                   | –               | –            | ✓              | –                    | –                    | –    |
| `all`                      | –               | ✓            | ✓              | –                    | –                    | –    |
| `bounding-box`             | –               | –            | –              | –                    | –                    | ✓    |
| `none`                     | –               | –            | –              | –                    | –                    | –    |

The CSS values `auto`, `inherit`, `unset` resolve to one of the above per the
spec (`auto` → `visiblePainted` for SVG content).

## Stroke widening

Hit-testing a stroked path requires widening the path geometry by the stroke
width, joins, miters, and dash pattern, then testing fill containment of the
widened path. Blink defers this to Skia's path stroker
(`SkPath::getFillPath`), which produces a new path representing the stroke's
outline.

For `vector-effect: non-scaling-stroke`, the stroke width must be inverted
through the current transform before stroking — handled in
`LayoutSVGShape::CalculateNonScalingStrokeBoundingBox` and the stroke hit
path.

## `clip-path` interaction

When `clip-path` is set, `ClipPathClipper::HitTest` evaluates the clip
geometry first. If the point is outside the clip, the element cannot be hit
regardless of `pointer-events`. `clip-path` resources can themselves be SVG
`<clipPath>` elements containing arbitrary nested paths — see
[resources-and-effects.md](./resources-and-effects.md).

## `<use>` and event retargeting

A hit on a clone inside a `<use>` shadow root **retargets** to the `<use>`
element for event dispatch. Authors get one consistent event source per
`<use>`, even if they reused the same `<symbol>` many times. Implemented by
the standard event-retargeting path that handles all closed shadow trees;
see `core/dom/events/event_path.cc`.

The `CorrespondingElement()` back-pointer on each cloned `SVGElement` lets
debugging and accessibility tools recover the original target.

## SVG text hit-testing

Hits on `<text>` / `<tspan>` / `<textPath>` use
`PointerEventsHitRules::kSvgTextHitTesting`, which has slightly different
default rules (text doesn't have a "stroke" in the same sense — though
stroked text does exist). The hit walks the LayoutNG inline fragments
(post the SVG text migration) and per-glyph rects, with the per-glyph
positions warped along the path for `<textPath>`.

```cpp
// box_fragment_painter.cc — text hit path entry
PointerEventsHitRules hit_rules(PointerEventsHitRules::kSvgTextHitTesting,
                                request, style.UsedPointerEvents());
```

## SVG image hit-testing

`LayoutSVGImage` uses `kSvgImageHitTesting`, which is mostly bounding-box
based (an `<image>` is a rectangle in user space, possibly rotated by an
ancestor transform).

## `bounding-box` value

`pointer-events: bounding-box` is the cheapest hit-test path — no path
containment, just AABB intersection. Useful for large invisible "click
catcher" overlays. For LayoutNG box content (inside `<foreignObject>`), the
same value is honored at the box-fragment level.

## Files

| File                                     | Role                                                     |
| ---------------------------------------- | -------------------------------------------------------- |
| `core/layout/svg/layout_svg_shape.cc`    | Shape hit entry, `HitTestShape`, fill/stroke containment |
| `core/layout/svg/layout_svg_image.cc`    | Image hit entry                                          |
| `core/layout/pointer_events_hit_rules.h` | `pointer-events` → bit flags lookup                      |
| `core/paint/clip_path_clipper.cc`        | `ClipPathClipper::HitTest` for clip-path                 |
| `core/paint/box_fragment_painter.cc`     | `kSvgTextHitTesting` text path entry                     |
| `platform/graphics/path.cc`              | `Contains` and `StrokeContains` (Skia bridge)            |

## See also

- [path-geometry.md](./path-geometry.md) — how shapes' `Path` objects are
  built; same paths are reused for hit-testing.
- [resources-and-effects.md](./resources-and-effects.md) — `clip-path`
  resolution.
- [use-and-foreign-object.md](./use-and-foreign-object.md) — event
  retargeting through `<use>` shadow roots.
