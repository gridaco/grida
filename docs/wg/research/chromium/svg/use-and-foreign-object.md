---
title: "Chromium SVG <use> and <foreignObject>"
tags:
  - internal
  - research
  - chromium
  - rendering
  - svg
---

# Chromium SVG `<use>` and `<foreignObject>`

Two mechanisms that create cross-tree references in SVG:

- `<use>` — instantiate another element (or subtree) as a reference.
- `<foreignObject>` — embed HTML (or any other XML) inside SVG.

Both introduce a tree-shape wrinkle that renderers need to understand.

## `<use>`

`<use href="#target">` renders a copy of `#target` at the position specified
by `<use>`'s `x` and `y` attributes, inheriting styles from the `<use>`'s
ancestor chain (not the target's original ancestors).

### Shadow-DOM instantiation

Blink implements `<use>` by **cloning the target into a user-agent shadow
tree** attached to the `<use>` element:

```cpp
// third_party/blink/renderer/core/svg/svg_use_element.h
class SVGUseElement final : public SVGGraphicsElement,
                            public SVGURIReference,
                            public SVGResourceDocumentObserver {
 public:
  explicit SVGUseElement(Document&);
  void InvalidateShadowTree();
  void InvalidateTargetReference();
  SVGGraphicsElement* VisibleTargetGraphicsElementForClipping() const;
  SVGAnimatedLength* x() const { return x_.Get(); }
  SVGAnimatedLength* y() const { return y_.Get(); }
  Path ToClipPath() const;
};
```

When `<use>`'s `href` resolves, `SVGUseElement::BuildPendingResource()`:

1. Resolves the reference (same document or external `.svg` resource).
2. Deep-clones the target subtree.
3. Attaches the clone as the `<use>` element's user-agent shadow root.
4. Applies `<use>`'s `x`/`y`/`width`/`height` to the cloned root (if it's
   a `<symbol>` or `<svg>`; otherwise `width`/`height` are ignored).
5. Style cascade runs on the cloned subtree as if it were a child of
   `<use>` — this is how inheritance "flips" from the original's ancestors
   to the use site's ancestors.

### Layout and paint

The shadow tree participates in layout and paint just like any ordinary
subtree. `LayoutSVGTransformableContainer` (or equivalent) handles the
`x`/`y` translation. Nothing special happens at paint time — the cloned
subtree is painted like any other.

### External references

If `href` is `foo.svg#id`, Blink loads `foo.svg` as a resource document
(`SVGResourceDocument`), parses it, and then resolves `#id` inside that
document. The referenced element is then cloned into the local shadow
tree, with its own resources (gradients, clip paths, etc.) carried along.

### Invalidation

Changes to the target element (or its descendants) trigger
`InvalidateShadowTree()` on every `<use>` that references it. The shadow
tree is torn down and rebuilt lazily. This is expensive for deeply
instantiated elements — a common optimization target.

### `<symbol>` vs `<g>`

`<symbol>` elements are invisible by default (like `<defs>`), but when
referenced by `<use>`, they become visible as `<svg>`-like viewport
containers with their own `viewBox` / `preserveAspectRatio`. Semantically:

```
<use href="#sym" x="10" y="10" width="50" height="50"/>
```

becomes approximately:

```
<svg x="10" y="10" width="50" height="50" viewBox="...">
  (children of #sym)
</svg>
```

The `<use>`-as-`<svg>` expansion is handled by the cloned shadow root
being the `<symbol>`'s children wrapped in an implicit viewport container.

### `<use>` as clip geometry

`LayoutSVGResourceClipper` can include `<use>` as a clip path child. The
`SVGUseElement::ToClipPath()` method returns the geometry of the resolved
target, transformed by the `<use>`'s x/y — so clip paths that reference
symbols via `<use>` can still collapse to a single `Path` on the fast
path.

## `<foreignObject>`

`<foreignObject>` embeds a non-SVG document fragment (typically HTML)
inside SVG, sized by its `x`, `y`, `width`, `height` attributes.

### Layout bridging

```cpp
// third_party/blink/renderer/core/layout/svg/layout_svg_foreign_object.h
class LayoutSVGForeignObject final : public LayoutSVGBlock {
 public:
  explicit LayoutSVGForeignObject(Element* element);
  bool IsObjectBoundingBoxValid() const;
  bool NodeAtPointFromSVG(HitTestResult&,
                          const HitTestLocation&,
                          const PhysicalOffset&,
                          HitTestPhase);
};
```

`LayoutSVGForeignObject` extends `LayoutSVGBlock`, which in turn reuses
LayoutNG block layout. Inside the foreign object, layout proceeds as
ordinary HTML block layout — the SVG coordinate system stops at the
`<foreignObject>` boundary.

The transform from SVG to HTML:

- SVG x/y attributes become a CSS-pixel translation.
- SVG transforms on ancestors are folded into the
  `PaintLayer`'s compositor transform (foreign objects always create
  their own paint layer).
- CSS `zoom` is applied carefully to avoid double-scaling (the SVG
  ancestor transforms already include zoom).

### Paint bridging

`SVGForeignObjectPainter` invokes `PaintLayer::PaintLayerContents()` on the
foreign object's layer, which runs the HTML paint path. From outside the
foreign object, its rendering is opaque — an SVG painter downstream of it
sees a single paint layer, not the HTML subtree.

### Hit-test trampoline

Because `<foreignObject>` has its own `PaintLayer`, hit tests must bounce
between SVG hit testing (path-based) and HTML hit testing (box-based):

```cpp
bool LayoutSVGForeignObject::NodeAtPointFromSVG(
    HitTestResult& result,
    const HitTestLocation& hit_test_location,
    const PhysicalOffset& accumulated_offset,
    HitTestPhase phase);
```

The caller (an SVG ancestor) calls `NodeAtPointFromSVG` with SVG-local
coordinates; the method transforms them to HTML box coordinates and
delegates to `PaintLayer::HitTest()`.

### Nested SVG in foreign object

An `<svg>` inside a `<foreignObject>` creates a new `LayoutSVGRoot` inside
the HTML subtree, which behaves as a replaced element. The SVG coordinate
space is established anew.

### Why it exists

The common use case is HTML-styled rich text inside an SVG illustration —
e.g., an infographic with `<foreignObject>`-embedded captions. The
foreignObject element preserves HTML semantics (text selection, line
breaking, CSS layout) inside an SVG context where those are otherwise
unavailable.

## Source files

| File                                          | Role                                                           |
| --------------------------------------------- | -------------------------------------------------------------- |
| `core/svg/svg_use_element.h`                  | `<use>` element; shadow instantiation, external ref loading    |
| `core/svg/svg_symbol_element.h`               | `<symbol>` — viewport semantics when referenced                |
| `core/layout/svg/layout_svg_foreign_object.h` | `<foreignObject>` bridge                                       |
| `core/paint/svg_foreign_object_painter.cc`    | Paint bridge                                                   |
| `core/paint/svg_root_painter.cc`              | `LayoutSVGRoot` paint entry (also used when SVG nests in HTML) |
