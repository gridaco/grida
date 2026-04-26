---
title: "Chromium SVG Accessibility"
tags:
  - internal
  - research
  - chromium
  - rendering
  - svg
  - accessibility
---

# Chromium SVG Accessibility

How SVG elements appear in Blink's accessibility (AX) tree. SVG is a
first-class citizen in the AX tree — not an opaque blob — and the role
mapping is implemented in the same `AXNodeObject` machinery HTML uses, with
SVG-aware branches.

## No dedicated AX class hierarchy

Unlike older versions of Blink (and unlike WebKit), there are no
`AXSVGRoot` / `AXSVGShape` etc. classes. SVG elements use `AXNodeObject`
with conditional logic:

```cpp
// third_party/blink/renderer/modules/accessibility/ax_node_object.cc
if (node && node->IsSVGElement()) {
  if (GetLayoutObject()->IsSVGImage()) {
    return ax::mojom::blink::Role::kImage;
  }
  if (IsA<SVGSVGElement>(node)) {
    return GetLayoutObject()->IsSVGRoot() ? ax::mojom::blink::Role::kSvgRoot
                                          : ax::mojom::blink::Role::kGroup;
  }
  if (IsA<SVGSymbolElement>(node)) {
    if (GetLayoutObject()->IsSVGViewportContainer()) {
      return ax::mojom::blink::Role::kGroup;
    }
  }
  if (GetLayoutObject()->IsSVGShape()) {
    return ax::mojom::blink::Role::kGraphicsSymbol;
  }
  if (GetLayoutObject()->IsSVGForeignObject()) {
    return ax::mojom::blink::Role::kGroup;
  }
  // ...
}
```

Role mapping is done at `NativeRole()` / `DetermineRoleValue()` time, based
on the element type and the layout object's `IsSVG*()` predicates.

## Default role mapping

| SVG element | Default role | Notes |
| ----------- | ------------ | ----- |
| `<svg>` (root) | `kSvgRoot` | Maps to `graphics-document` per SVG-AAM |
| `<svg>` (nested) | `kGroup` | Author opt-in to `kRegion` via `role="group"` etc. |
| `<symbol>` | `kGroup` (when `LayoutSVGViewportContainer`) | Otherwise hidden |
| `<g>` | (generic — usually filtered) | Inherits role from children unless author sets one |
| `<path>`, `<circle>`, `<rect>`, `<ellipse>`, `<line>`, `<polygon>`, `<polyline>` | `kGraphicsSymbol` | Per SVG-AAM |
| `<image>` | `kImage` | |
| `<foreignObject>` | `kGroup` | Children fall back to HTML AX mapping |
| `<text>`, `<tspan>` | (text content) | Exposed via accessible name |
| `<title>` | (consumed) | Becomes the parent's accessible name |
| `<desc>` | (consumed) | Becomes the parent's accessible description |
| Resource elements (`<defs>`, `<clipPath>`, `<mask>`, `<filter>`, `<marker>`, `<linearGradient>`, ...) | hidden | Not in the AX tree |

The `kSvgRoot` mapping for root `<svg>` is technically a Chromium extension
beyond the SVG-AAM spec (which currently maps all `<svg>` to
`graphics-document`); see the comment in `ax_node_object.cc` referencing
[w3c/svg-aam#18](https://github.com/w3c/svg-aam/issues/18).

## Accessible name and description

`<title>` and `<desc>` children are picked up as the accessible name and
description for the parent SVG element:

```xml
<svg role="img" aria-labelledby="title">
  <title id="title">A red circle</title>
  <desc>Used as a status indicator.</desc>
  <circle cx="50" cy="50" r="40" fill="red"/>
</svg>
```

This is the idiomatic pattern for SVG content that's semantically a single
image. Without `role="img"`, screen readers walk the SVG subtree as a
graphics document and announce children individually — usually not what the
author wants for an icon.

## Author opt-ins

| Author markup | Effect |
| ------------- | ------ |
| `<svg role="img" aria-label="...">` | Treated as a single image with the given name |
| `<svg role="img" aria-labelledby="t" aria-describedby="d">` | Same, with linked title/desc |
| `<svg role="presentation">` or `<svg role="none">` | Removed from AX tree (decorative) |
| `<svg aria-hidden="true">` | Removed from AX tree |
| `<g role="group" aria-label="...">` | Group is exposed with name |
| `<path role="graphics-symbol" aria-label="...">` | Per-shape labeling |

Per the WAI-ARIA Graphics Module, additional roles are available:
`graphics-document`, `graphics-object`, `graphics-symbol`. Blink honors
these and maps them through `ax::mojom::blink::Role::kGraphics*` values.

## Hit-test ↔ AX integration

When an assistive technology issues a "what's at this point" query, the
SVG hit-test path (see [hit-testing.md](./hit-testing.md)) returns an
`SVGElement`, and the AX tree's `AXObjectFromAXID` / `AccessibleNodeForId`
machinery resolves it to its `AXNodeObject`. `pointer-events: none` on an
SVG element does **not** remove it from the AX tree by itself —
accessibility is independent of pointer hit-testing.

## Special cases

### `<use>` clones

A `<use>` element exposes the cloned subtree's accessible content (so an
icon defined once and instantiated 50 times is announced consistently).
Events retarget through `<use>`, but accessibility traversal sees the
clones; `aria-label` on the `<use>` itself can override the clone's name.

### SVG-as-image (`SVGImage`)

When SVG is loaded as `<img src="x.svg">` or `background-image: url(x.svg)`,
the isolated `SVGImage` document is **not** part of the host's AX tree.
The host's `<img>` element appears in the AX tree as `kImage`, with the
`alt` attribute as its accessible name. Internal SVG structure is opaque
from the host's perspective.

### Inline SVG inside `<foreignObject>`

A `<foreignObject>` containing HTML re-enters HTML's AX path for its
descendants. The boundary is automatic — the AX tree just continues
walking the DOM.

## Files

| File | Role |
| ---- | ---- |
| `modules/accessibility/ax_node_object.cc` | SVG role mapping, accessible-name extraction (no separate AXSVG class) |
| `modules/accessibility/ax_object.cc` | Common predicates (`IsA<SVGElement>`-aware) |
| `modules/accessibility/ax_object_cache.cc` | Element → AXObject mapping |
| `modules/accessibility/ax_enums.h` | `Role` enum (incl. `kSvgRoot`, `kGraphicsSymbol`, ...) |

## See also

- [hit-testing.md](./hit-testing.md) — point → element resolution that AT
  uses for "what's here?".
- [use-and-foreign-object.md](./use-and-foreign-object.md) — how `<use>`
  and `<foreignObject>` show up in the AX tree.
