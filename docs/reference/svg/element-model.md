---
title: "SVG Element Model — Geometry, Presentation, Frames, Round-Trip Hazards"
description: "Spec-grounded reference for the SVG element surface a graphical editor IR must expose: per-element geometry, presentation hooks, local frames, and round-trip hazards."
keywords:
  - svg
  - element-model
  - geometry
  - presentation
  - round-trip
  - svg-editor
tags:
  - internal
  - research
  - svg
format: md
---

# SVG Element Model

Spec-grounded reference for the SVG element surface a graphical editor IR must
expose. Scope: per-element geometry attributes, presentation attribute hooks,
local coordinate frames, the kinds of in-place mutations that preserve byte
round-trip, and cross-element constructs that resist editing. Citations link
to specific sections of [SVG 2](https://www.w3.org/TR/SVG2/), [SVG 1.1](https://www.w3.org/TR/SVG11/),
[CSS Cascade 5](https://www.w3.org/TR/css-cascade-5/), [Filter Effects](https://drafts.fxtf.org/filter-effects/),
and [CSS Masking](https://drafts.fxtf.org/css-masking/).

## Conventions

- **Presentation attributes** are the painting / typography properties listed
  in [SVG 2 §11 Painting](https://www.w3.org/TR/SVG2/painting.html) and
  [§13 Text](https://www.w3.org/TR/SVG2/text.html): `fill`, `fill-opacity`,
  `fill-rule`, `stroke`, `stroke-width`, `stroke-opacity`, `stroke-linecap`,
  `stroke-linejoin`, `stroke-miterlimit`, `stroke-dasharray`,
  `stroke-dashoffset`, `paint-order`, `opacity`, `visibility`, `display`,
  `color`, plus text properties `font-family`, `font-size`, `font-weight`,
  `font-style`, `text-anchor`, `dominant-baseline`, etc. Each may be written
  as an XML attribute or as a CSS declaration; this doc says "presentation"
  to mean both encodings unless noted. See
  [§Hazards](#hazards-cross-cutting) for the cascade interaction.
- **Structural attributes** mean `id`, `class`, `style`, `transform`,
  `clip-path`, `mask`, `filter`, plus ARIA / scripting hooks. They are
  available on essentially every rendered element; per-element sections
  call out only deviations.
- **Local frame** describes the coordinate system the element's geometry
  attributes are interpreted in, before `transform=` is applied. Whether
  the element establishes a new viewport (per [§7.2 Establishing a new
  SVG viewport](https://www.w3.org/TR/SVG2/coords.html#EstablishingANewSVGViewport))
  is called out explicitly.
- **Edit characterization** describes what graphical mutations the editor
  can perform without falling back to a `<path>` conversion. The blanket
  rule: shapes have no native scale/skew attribute, so non-uniform scale,
  shear, and rotation must live on `transform=`.

---

## `rect`

Defined in [SVG 2 §10.2](https://www.w3.org/TR/SVG2/shapes.html#RectElement).

- **Geometry attrs**: `x` (init `0`), `y` (init `0`), `width` (init `0`,
  must be `>=0`), `height` (init `0`, `>=0`), `rx` (init `auto`),
  `ry` (init `auto`). `pathLength` per
  [§10.7](https://www.w3.org/TR/SVG2/shapes.html#PathLengthAttribute).
- **Presentation attrs**: full fill/stroke set; see
  [§Conventions](#conventions).
- **Structural attrs**: standard set.
- **Local frame**: `(x, y)` is the top-left corner in the current user
  coordinate system; the rect is axis-aligned in that frame
  ([§10.2](https://www.w3.org/TR/SVG2/shapes.html#RectElement)).
- **Edit characterization**:
  - translate: mutate `x`, `y`.
  - resize axis-aligned: mutate `width`, `height` (and possibly `x`, `y`
    for top/left drags).
  - corner radius: `rx`, `ry`.
  - rotation, shear, non-uniform scale: `transform=` only.
- **Round-trip hazards**: `rx`/`ry` `auto` resolves from the other value at
  render time; preserve the raw token, not the resolved length. Negative
  `width`/`height` are an error per spec — clamp at editor boundary, do
  not silently rewrite.

---

## `circle`

Defined in [SVG 2 §10.3](https://www.w3.org/TR/SVG2/shapes.html#CircleElement).

- **Geometry attrs**: `cx` (init `0`), `cy` (init `0`), `r` (init `0`,
  `>=0`). `pathLength` permitted.
- **Presentation attrs**: full fill/stroke set.
- **Structural attrs**: standard.
- **Local frame**: `(cx, cy)` is the center in the current user coordinate
  system.
- **Edit characterization**:
  - translate: `cx`, `cy`.
  - uniform scale: `r`.
  - turn into an ellipse (independent x/y radii): no native path — either
    add `transform=scale(...)` (changes paint scaling, not geometry) or
    convert to `<ellipse>`. Pick one and document it; do not silently
    cross element type.
  - rotation: irrelevant geometrically, but `transform=` still mutates the
    rendered frame for strokes and child markers.
- **Round-trip hazards**: none specific beyond shared transform vs scale
  ambiguity.

---

## `ellipse`

Defined in [SVG 2 §10.4](https://www.w3.org/TR/SVG2/shapes.html#EllipseElement).

- **Geometry attrs**: `cx` (init `0`), `cy` (init `0`), `rx` (init `auto`),
  `ry` (init `auto`). `pathLength` permitted.
- **Presentation attrs**: full fill/stroke set.
- **Structural attrs**: standard.
- **Local frame**: `(cx, cy)` is the center; axes are aligned with the
  user coordinate system.
- **Edit characterization**:
  - translate: `cx`, `cy`.
  - resize axes: `rx`, `ry`.
  - rotation: `transform=rotate(...)` only; ellipse has no native
    `rotate` attribute.
- **Round-trip hazards**: `rx`/`ry` `auto` defaults to the other value per
  [§10.4](https://www.w3.org/TR/SVG2/shapes.html#EllipseElement); the IR
  must remember which side was `auto` to round-trip the bytes.

---

## `line`

Defined in [SVG 2 §10.5](https://www.w3.org/TR/SVG2/shapes.html#LineElement).

- **Geometry attrs**: `x1`, `y1`, `x2`, `y2` (all init `0`).
  `pathLength` permitted.
- **Presentation attrs**: stroke set is the meaningful subset (no fill
  area by default).
- **Structural attrs**: standard.
- **Local frame**: both endpoints in the current user coordinate system.
- **Edit characterization**:
  - move endpoint A: `x1`, `y1`.
  - move endpoint B: `x2`, `y2`.
  - translate whole: mutate both endpoints; or wrap in `transform=`.
  - any non-translate global affine: `transform=` only.
- **Round-trip hazards**: `line` accepts `fill` but it has no rendered
  effect ([§10.5](https://www.w3.org/TR/SVG2/shapes.html#LineElement));
  do not treat author fill as dead-code and strip it.

---

## `polyline`

Defined in [SVG 2 §10.6](https://www.w3.org/TR/SVG2/shapes.html#PolylineElement).

- **Geometry attrs**: `points` (list of coordinate pairs, init empty).
  `pathLength` permitted.
- **Presentation attrs**: full fill/stroke set. **Note:** `polyline` is
  _not_ implicitly closed but the `fill` region is still defined by
  closing the polygon for fill rule purposes.
- **Structural attrs**: standard.
- **Local frame**: every coordinate is in the current user coordinate
  system ([§10.6](https://www.w3.org/TR/SVG2/shapes.html#PolylineElement)).
- **Edit characterization**:
  - move vertex `n`: rewrite the `n`-th pair in `points`.
  - insert / delete vertex: rewrite `points`.
  - global affine: `transform=`.
- **Round-trip hazards**: `points` permits whitespace, commas, sign
  packing (`1-2` = `1,-2`). Preserve the source token sequence; do not
  re-serialize on every save or you will churn diffs.

---

## `polygon`

Defined in [SVG 2 §10.7](https://www.w3.org/TR/SVG2/shapes.html#PolygonElement).

- **Geometry attrs**: `points` (list of coordinate pairs, init empty).
  `pathLength` permitted.
- **Presentation attrs**: full fill/stroke set; the close-segment is
  implicit.
- **Structural attrs**: standard.
- **Local frame**: every coordinate is in the current user coordinate
  system.
- **Edit characterization**: same as `polyline`. Adding/removing the
  final segment is implicit — there is no "close" toggle attribute; to
  un-close, switch element type to `polyline`.
- **Round-trip hazards**: same source-token preservation hazard as
  `polyline`.

---

## `path`

Defined in [SVG 2 §9](https://www.w3.org/TR/SVG2/paths.html#PathElement);
the `d` property is in [§9.4](https://www.w3.org/TR/SVG2/paths.html#DProperty).

- **Geometry attrs**: `d` (init `none`), `pathLength`.
- **Presentation attrs**: full fill/stroke set; `fill-rule` matters.
- **Structural attrs**: standard.
- **Local frame**: every coordinate inside `d` is in the current user
  coordinate system; commands `M m L l H h V v C c S s Q q T t A a Z z`
  per [§9.3.1](https://www.w3.org/TR/SVG2/paths.html#PathDataBNF).
  Uppercase = absolute, lowercase = relative to current point.
- **Edit characterization**:
  - move vertex / handle: rewrite the affected command's coordinates.
  - segment-type change (e.g. line to cubic): rewrite the command,
    inheriting endpoints.
  - global affine: `transform=` (preferred — `d` rewrite would lose
    user-authored relative/absolute structure).
- **Round-trip hazards**:
  - `d` is a serialized mini-language. Round-tripping requires either
    preserving the source string verbatim when no vertex changed, or
    a canonical normalizer the editor commits to and the user accepts.
  - Implicit lineto after a moveto (per
    [§9.3.3](https://www.w3.org/TR/SVG2/paths.html#PathDataMovetoCommands))
    is easy to lose in a naive parse-emit cycle.
  - `pathLength` is author-supplied and rescales dash arrays; do not
    drop it on edit.

---

## `text`

Defined in [SVG 2 §11.2 Text element](https://www.w3.org/TR/SVG2/text.html#TextElement).

- **Geometry attrs**: `x`, `y`, `dx`, `dy`, `rotate` (each a list, applied
  per-character), `textLength`, `lengthAdjust` (`spacing` |
  `spacingAndGlyphs`). Single-number `x`/`y` is the common case.
- **Presentation attrs**: paint set plus text properties
  (`font-family`, `font-size`, `font-weight`, `font-style`,
  `text-anchor`, `dominant-baseline`, `direction`, `writing-mode`,
  `letter-spacing`, `word-spacing`, `white-space`). See
  [§11.12](https://www.w3.org/TR/SVG2/text.html#TextProperties).
- **Structural attrs**: standard.
- **Local frame**: the _current text position_ starts at the first
  `(x, y)` from this element or inherited from ancestor. Glyphs advance
  along the inline-progression axis from there. `(0, 0)` is the
  anchor before the first glyph in this element's frame, not its
  visual top-left.
- **Edit characterization**:
  - move whole block: `x`, `y` (single values).
  - per-glyph positioning: only respectable if the user authored a
    per-glyph list to begin with. Do not synthesize per-glyph arrays
    on translate of an authored single-value `x`.
  - rotate text block: `transform=rotate(...)` (the `rotate=` attribute
    is _per-glyph_, not block-level).
  - reflow / resize: SVG `<text>` does not wrap; width is implicit.
    Resize is not a native operation — either re-author `x`/`y` per
    line as separate `<tspan>` or accept that drag-resize is a no-op.
- **Round-trip hazards**: significant whitespace handling is governed by
  `white-space` and `xml:space`; collapsing or re-indenting the XML
  silently mutates rendered content.

---

## `tspan`

Defined in [SVG 2 §11.3](https://www.w3.org/TR/SVG2/text.html#TextElement)
(shares the text-element section).

- **Geometry attrs**: same set as `text` — `x`, `y`, `dx`, `dy`,
  `rotate`, `textLength`, `lengthAdjust`. Unspecified positions inherit
  the parent's current text position.
- **Presentation attrs**: full text/paint set; intended primary use is
  _overriding_ a property for a substring.
- **Structural attrs**: standard.
- **Local frame**: inherits the enclosing `<text>` element's coordinate
  system and current text position.
- **Edit characterization**:
  - the canonical editor operation is "apply property X to selection
    [a, b)"; this is a `<tspan>` split. Splitting / merging tspans is
    not a single-attribute mutation — it restructures the XML tree.
  - geometric per-glyph positioning lives on the parent `<text>` or
    via per-character arrays here; either is legal.
- **Round-trip hazards**: tspan boundaries are visible in the text node
  graph; splitting on every property toggle bloats the DOM, merging
  loses author intent. Editor must choose a normalization policy.

---

## `textPath`

Defined in [SVG 2 §11.4](https://www.w3.org/TR/SVG2/text.html#TextPathElement).

- **Geometry attrs**: `href` (the path), `startOffset`, `side`
  (`left` | `right`), `method` (`align` | `stretch`),
  `spacing` (`auto` | `exact`), `textLength`, `lengthAdjust`. Inline
  `path=` is also allowed in SVG 2.
- **Presentation attrs**: text/paint set.
- **Structural attrs**: standard. **Note:** `x`, `y`, `dx`, `dy`,
  `rotate` on a `<textPath>` are _ignored_ — the path supplies them.
- **Local frame**: positions are 1-D offsets along the referenced
  path's arclength, not 2-D coordinates. `(0, 0)` is not meaningful;
  the origin is the path start (modulated by `startOffset`).
- **Edit characterization**:
  - slide along path: mutate `startOffset`.
  - flip to other side: `side=left|right`.
  - rebind to a different path: mutate `href`.
  - move-by-drag in screen space: not a native operation; the path is
    independent geometry. Refuse or fall back to editing the path.
- **Round-trip hazards**: changes to the referenced `<path>` `d` shift
  the text without any local mutation; editor must invalidate.

---

## `svg`

Defined in [SVG 2 §5.1](https://www.w3.org/TR/SVG2/struct.html#SVGElement).
Establishes a new viewport per
[§7.2](https://www.w3.org/TR/SVG2/coords.html#EstablishingANewSVGViewport).

- **Geometry attrs**: `x`, `y`, `width`, `height` (for inner `<svg>`;
  outermost `<svg>` uses CSS box on the host), `viewBox`,
  `preserveAspectRatio`, `zoomAndPan`.
- **Presentation attrs**: standard paint set is accepted; primary use is
  `overflow`, `color`.
- **Structural attrs**: standard plus `xmlns`, `version`, `baseProfile`.
- **Local frame**: establishes a new SVG viewport and a user coordinate
  system. `viewBox` sets the user coordinates _inside_;
  `preserveAspectRatio` controls how that user space maps onto the
  viewport rectangle.
- **Edit characterization**:
  - reposition inner `<svg>`: `x`, `y`.
  - resize: `width`, `height`; this rescales children if `viewBox` is
    set, or just enlarges the viewport otherwise.
  - rebind frame: mutate `viewBox`; pan = translate min-x/min-y,
    zoom = scale width/height.
- **Round-trip hazards**: `width`/`height` as percentages vs lengths
  vs absent (defaults to `100%`) all render the same when embedded but
  differ semantically; preserve the source form. CSS-property
  `transform` on `<svg>` applies to the _outside_ of the element per
  [§7.4](https://www.w3.org/TR/SVG2/coords.html#TransformProperty),
  conceptually wrapping the element; not symmetric with `transform=`
  on inner elements.

---

## `g`

Defined in [SVG 2 §5.2](https://www.w3.org/TR/SVG2/struct.html#GroupElement).

- **Geometry attrs**: none. `g` has no `x`, `y`, `width`, `height`.
- **Presentation attrs**: paint set is accepted and _inherited_ by
  descendants (the primary use of `g` for grouped property assignment).
- **Structural attrs**: standard. `transform=` is the only positioning
  knob.
- **Local frame**: identity unless `transform=` is set. Does _not_
  establish a viewport.
- **Edit characterization**:
  - translate group: `transform=translate(...)`.
  - any other affine: `transform=`.
  - "set width": not a thing — group dimensions are the union of
    children. Drag-resize is per-child re-layout, not a group attr.
- **Round-trip hazards**: ungrouping / regrouping reorders the DOM and
  can change cascade order if children carry presentation attrs;
  refuse to auto-collapse `g` wrappers.

---

## `symbol`

Defined in [SVG 2 §5.5](https://www.w3.org/TR/SVG2/struct.html#SymbolElement).
Establishes a new viewport when _instanced by `<use>`_.

- **Geometry attrs**: `x`, `y`, `width`, `height`, `viewBox`,
  `preserveAspectRatio`, `refX`, `refY`.
- **Presentation attrs**: paint set is inherited by clones.
- **Structural attrs**: standard.
- **Local frame**: not rendered on its own. When referenced by `<use>`,
  the `<symbol>` establishes a nested viewport sized by the `<use>`
  geometry, with `viewBox` mapping the internal user space.
- **Edit characterization**:
  - editing geometry attrs on `<symbol>` affects _every_ `<use>` of it;
    this is reference editing, not instance editing.
  - to edit one instance, edit the `<use>` instead.
- **Round-trip hazards**: `<symbol>` outside `<defs>` is still
  non-rendering by itself but participates in cascade and document
  order; do not collapse to `<defs>` membership.

---

## `defs`

Defined in [SVG 2 §5.4](https://www.w3.org/TR/SVG2/struct.html#DefsElement).

- **Geometry attrs**: none. Contents do not render directly.
- **Presentation attrs**: accepted on `<defs>` but inherited by
  children; rarely useful.
- **Structural attrs**: standard.
- **Local frame**: not rendered; `(0, 0)` is not meaningful.
- **Edit characterization**: `<defs>` is a non-rendering container.
  Edits to children (paint servers, symbols, filters) propagate to
  every reference. Treat as a "definition library" panel, not a
  canvas-editable target.
- **Round-trip hazards**: some authoring tools require all referenced
  definitions to live inside a `<defs>`; others permit forward
  references. The spec does not require `<defs>` membership for
  referenceable elements ([§5.4](https://www.w3.org/TR/SVG2/struct.html#DefsElement)).

---

## `switch`

Defined in [SVG 1.1 §5.8](https://www.w3.org/TR/SVG11/struct.html#SwitchElement)
(SVG 2 carries the element with the same behavior).

- **Geometry attrs**: none.
- **Presentation attrs**: standard set; `transform=` allowed.
- **Structural attrs**: standard. Children are evaluated against
  `systemLanguage`, `requiredExtensions`, `requiredFeatures`
  (last is SVG 1.1 only — SVG 2 deprecates it).
- **Local frame**: identity; rendering frame of whichever child is
  selected.
- **Edit characterization**: the rendered child is the _first_ child
  whose conditional attrs all evaluate true. A graphical editor cannot
  meaningfully select the "child" without first picking a locale
  context. Editing siblings is editing the unrendered branches.
- **Round-trip hazards**: see [§Hazards](#hazards-cross-cutting).

---

## `use`

Defined in [SVG 2 §5.6](https://www.w3.org/TR/SVG2/struct.html#UseElement).

- **Geometry attrs**: `x`, `y`, `width`, `height`, `href`
  (or legacy `xlink:href`).
- **Presentation attrs**: paint set is inherited by the cloned subtree
  unless overridden in the source.
- **Structural attrs**: standard.
- **Local frame**: the cloned content is rendered as if it were a
  shadow tree at the `<use>` element's position. `width`/`height`
  only have effect when the referent is `<svg>` or `<symbol>`
  (overriding their viewport sizing).
- **Edit characterization**:
  - move instance: `x`, `y`.
  - resize: only meaningful for symbol/svg referents.
  - global affine: `transform=`.
  - edit instance contents: not possible directly — the shadow tree
    is read-only per
    [§5.6.1](https://www.w3.org/TR/SVG2/struct.html#UseShadowTree):
    "Any attempt to directly modify the elements, attributes, and
    other nodes in the shadow tree must throw a
    `NoModificationAllowedError`." Editing the referent is the only
    path; it changes every instance.
- **Round-trip hazards**: circular `<use>` references are invalid and
  must not render. Editor must reject creation of cycles.

---

## `linearGradient`

Defined in [SVG 2 §13.2](https://www.w3.org/TR/SVG2/pservers.html#LinearGradients).

- **Geometry attrs**: `x1` (init `0%`), `y1` (init `0%`), `x2` (init
  `100%`), `y2` (init `0%`), `gradientUnits` (init `objectBoundingBox`),
  `gradientTransform`, `spreadMethod` (`pad` | `reflect` | `repeat`),
  `href` (template).
- **Presentation attrs**: not a render target; child `<stop>` carries
  `stop-color`, `stop-opacity`.
- **Structural attrs**: standard.
- **Local frame**: depends on `gradientUnits`:
  - `userSpaceOnUse` — coordinates in the user coordinate system at the
    _referencing_ element's position.
  - `objectBoundingBox` (default) — `0..1` maps to the referencing
    element's bounding box.
- **Edit characterization**: not an edit target on the canvas; edits
  happen via paint pickers operating on the _referencing_ element's
  `fill`/`stroke`. The IR must surface gradient handles in the picker's
  frame, not the document's.
- **Round-trip hazards**: `objectBoundingBox` coordinates are unit
  square; the editor cannot present them in document pixels without
  knowing the current referent. `href` chains let one gradient
  inherit stops or geometry from another — partial overrides.

---

## `radialGradient`

Defined in [SVG 2 §13.3](https://www.w3.org/TR/SVG2/pservers.html#RadialGradients).

- **Geometry attrs**: `cx` (init `50%`), `cy` (init `50%`), `r`
  (init `50%`), `fx`, `fy` (init equal to `cx`, `cy`), `fr` (init `0%`),
  `gradientUnits`, `gradientTransform`, `spreadMethod`, `href`.
- **Presentation attrs**: see linear gradient.
- **Structural attrs**: standard.
- **Local frame**: same `userSpaceOnUse` / `objectBoundingBox` split as
  linear.
- **Edit characterization**: as linear; the focal-point handles
  (`fx`, `fy`, `fr`) are extra UI affordances.
- **Round-trip hazards**: `fx`/`fy` default to `cx`/`cy` — preserve
  absence vs equal-value to round-trip.

---

## `pattern`

Defined in [SVG 2 §13.4](https://www.w3.org/TR/SVG2/pservers.html#PatternElement).

- **Geometry attrs**: `x`, `y`, `width`, `height`, `patternUnits` (init
  `objectBoundingBox`), `patternContentUnits` (init `userSpaceOnUse`),
  `patternTransform`, `viewBox`, `preserveAspectRatio`, `href`.
- **Presentation attrs**: not a render target.
- **Structural attrs**: standard.
- **Local frame**: tile rectangle established by `patternUnits`; tile
  _content_ uses `patternContentUnits` — note the two axes can be
  different units, which is a common authoring footgun.
- **Edit characterization**: paint server; same as gradients — not a
  canvas-direct target.
- **Round-trip hazards**: `patternUnits` and `patternContentUnits`
  defaults differ; canonical normalization will change rendering for
  documents that relied on defaults.

---

## `marker`

Defined in [SVG 2 §11.6 Marker properties](https://www.w3.org/TR/SVG2/painting.html#MarkerElement).

- **Geometry attrs**: `refX`, `refY` (length, percentage, or keyword:
  `left`/`center`/`right` for `refX`; `top`/`center`/`bottom` for
  `refY`), `markerWidth`, `markerHeight`, `markerUnits`
  (`strokeWidth` | `userSpaceOnUse`), `orient` (`auto` |
  `auto-start-reverse` | angle), `viewBox`, `preserveAspectRatio`.
- **Presentation attrs**: inherited by marker contents.
- **Structural attrs**: standard.
- **Local frame**: a viewport sized by `markerWidth` × `markerHeight`;
  `viewBox` sets the user-space mapping; `refX`/`refY` is the point
  inside that frame that aligns to the vertex being decorated.
- **Edit characterization**: glyph decorator; edited via the picker
  attached to `marker-start` / `marker-mid` / `marker-end` on the
  referent. Per-instance rotation comes from `orient=auto`, not from
  the marker element itself.
- **Round-trip hazards**: `markerUnits=strokeWidth` (default) means
  marker size depends on the referent's `stroke-width`; resizing a
  marker by mutating `markerWidth` rescales every reference.

---

## `clipPath`

Defined in [CSS Masking Module §6](https://drafts.fxtf.org/css-masking/#ClipPathElement);
historical attributes per [SVG 1.1 §14.3.5](https://www.w3.org/TR/SVG11/masking.html#ClipPathElement).

- **Geometry attrs**: `clipPathUnits` (`userSpaceOnUse` (default) |
  `objectBoundingBox`). The clipping geometry lives in _child shape
  elements_.
- **Presentation attrs**: `clip-rule` on children matters; paint is
  ignored.
- **Structural attrs**: standard.
- **Local frame**: per `clipPathUnits`. With `userSpaceOnUse`, child
  shapes are in the user coordinate system at the _referencing_
  element; with `objectBoundingBox`, they are in unit-square coordinates
  of the referent's bbox.
- **Edit characterization**: clip-shape editing is editing the child
  shape's native attributes; not a `<clipPath>`-attribute mutation.
- **Round-trip hazards**: CSS `clip-path` property and SVG `<clipPath>`
  - `clip-path=url(#...)` attribute are different surfaces with
    different syntax (`inset()`, `polygon()`, etc. for CSS); preserve
    the original form.

---

## `mask`

Defined in [CSS Masking Module §8](https://drafts.fxtf.org/css-masking/#MaskElement);
historical attributes per [SVG 1.1 §14.4](https://www.w3.org/TR/SVG11/masking.html#MaskElement).

- **Geometry attrs**: `x` (init `-10%`), `y` (init `-10%`), `width`
  (init `120%`), `height` (init `120%`), `maskUnits` (init
  `objectBoundingBox`), `maskContentUnits` (init `userSpaceOnUse`),
  `mask-type` (`luminance` (default in SVG 1.1) | `alpha`).
- **Presentation attrs**: mask region paint is honored; `color` and
  filters apply.
- **Structural attrs**: standard.
- **Local frame**: split — region rectangle in `maskUnits`, content in
  `maskContentUnits`. Defaults differ (region = bbox unit square,
  content = user space); a common rendering surprise.
- **Edit characterization**: paint a mask = edit the child rendering
  tree; reposition the mask region = mutate `x`/`y`/`width`/`height`.
- **Round-trip hazards**: same dual-units surprise as `<pattern>`.

---

## `filter`

Defined in [Filter Effects Module §6](https://drafts.fxtf.org/filter-effects/#FilterElement);
historical attributes per [SVG 1.1 §15.5](https://www.w3.org/TR/SVG11/filters.html#FilterElement).

- **Geometry attrs**: `x` (init `-10%`), `y` (init `-10%`), `width`
  (init `120%`), `height` (init `120%`), `filterUnits` (init
  `objectBoundingBox`), `primitiveUnits` (init `userSpaceOnUse`),
  `href` (template); `filterRes` is SVG 1.1 only and deprecated.
- **Presentation attrs**: irrelevant to the filter element itself;
  primitives carry their own.
- **Structural attrs**: standard.
- **Local frame**: filter region in `filterUnits`; primitive lengths in
  `primitiveUnits`. Same dual-units pattern as mask and pattern.
- **Edit characterization**: filter editing means editing the
  _primitive children_ (`<feGaussianBlur>`, `<feColorMatrix>`, …),
  which is a node-graph editor, not a single-attribute mutation.
- **Round-trip hazards**: filter primitive graphs have implicit
  in/result chaining; deleting a primitive can break downstream
  references silently. CSS `filter` property and SVG `<filter>` +
  `filter=url(#...)` are separate surfaces.

---

## `image`

Defined in [SVG 2 §9 Embedded content](https://www.w3.org/TR/SVG2/embedded.html#ImageElement).

- **Geometry attrs**: `x`, `y`, `width`, `height`, `href`,
  `preserveAspectRatio`, `crossorigin`.
- **Presentation attrs**: `image-rendering`, `opacity`, `visibility`,
  `clip-path`, `mask`, `filter` apply; `fill`/`stroke` do not paint
  the bitmap.
- **Structural attrs**: standard.
- **Local frame**: `(x, y)` is the top-left of the positioning
  rectangle in user coordinates; the bitmap is fitted into that
  rectangle by `preserveAspectRatio`. `overflow:hidden` by default
  per spec — content that violates aspect ratio fit is clipped.
- **Edit characterization**:
  - move: `x`, `y`.
  - resize: `width`, `height`.
  - rebind asset: `href`.
  - crop: not native — wrap in `<clipPath>` or use a CSS aspect-ratio
    override.
- **Round-trip hazards**: data-URI `href` payloads are large and
  whitespace-sensitive; the IR must hold the raw `href` token, not a
  decoded blob.

---

## `style`

Defined in [SVG 2 §6.4](https://www.w3.org/TR/SVG2/styling.html#StyleElement).

- **Geometry attrs**: none.
- **Presentation attrs**: none (style is a sheet, not a graphic).
- **Structural attrs**: `type` (init `text/css`), `media` (init `all`),
  `title`.
- **Local frame**: not rendered.
- **Edit characterization**: a CSS text node. Mutating a single
  selector's value can affect any number of canvas elements that match
  it. Not a direct graphical mutation target; either treat as opaque
  source or refuse edits that round-trip through inline-style
  conversions. See [§Hazards](#hazards-cross-cutting).
- **Round-trip hazards**: the cascade.

---

## `foreignObject`

Defined in [SVG 2 §9.8](https://www.w3.org/TR/SVG2/embedded.html#ForeignObjectElement).

- **Geometry attrs**: `x`, `y`, `width`, `height`. No
  `preserveAspectRatio` and no `href`.
- **Presentation attrs**: `overflow`, `opacity`, `visibility`, plus
  applicable CSS layout on contents.
- **Structural attrs**: standard.
- **Local frame**: the rectangle is a CSS containing block for the
  foreign-namespace contents; child layout follows the foreign
  language's model (HTML/CSS for `xmlns="http://www.w3.org/1999/xhtml"`,
  MathML, etc.).
- **Edit characterization**: only the SVG-side rectangle is editable in
  the canvas. The contents are an embedded foreign document — out of
  scope for a vector editor; treat as opaque.
- **Round-trip hazards**: see [§Hazards](#hazards-cross-cutting).

---

## Hazards (cross-cutting)

Constructs that resist round-trip graphical editing across element types.

- **`<style>` cascade.** Per [SVG 2 §6.3
  Presentation attributes](https://www.w3.org/TR/SVG2/styling.html#PresentationAttributes):
  "Presentation attributes contribute to the author level of the
  cascade, following all other author-level style sheets, and have
  specificity 0." Mutating an inline `fill=` attribute on a rect is a
  no-op if a `<style>` selector with specificity ≥ 1 targets that rect.
  The IR must read computed style, not the attribute alone, before
  reporting a property's effective value; writes that "set fill to
  red" must either edit the matching CSS rule or wrap in an inline
  `style="fill:red"` (specificity 1,0,0,0) that overrides — neither
  preserves source structure.
- **SMIL `<animate>`, `<animateTransform>`, `<set>`, `<animateMotion>`.**
  Per [SVG 2 §19](https://www.w3.org/TR/SVG2/animate.html) (SVG 2
  retains SMIL by reference). A property's _rendered_ value at any
  instant may differ from its base value. Edit decisions must use the
  base value; visual feedback must reflect the animated value or be
  honest about the divergence.
- **`<switch>` language branching.** Per [SVG 1.1
  §5.8](https://www.w3.org/TR/SVG11/struct.html#SwitchElement): "The
  switch renders the first of its children for which all of these
  attributes test true." The visually selected child depends on the
  user agent locale; editing "the rendered text" silently mutates only
  one locale's branch.
- **`<foreignObject>` content.** A foreign-namespace document tree
  (HTML, MathML) inside an SVG. The vector editor's primitives do not
  apply.
- **Foreign-namespace metadata.** `sodipodi:*`, `inkscape:*`,
  `xmlns:adobe-illustrator`, `xmlns:graph` and similar are non-SVG
  attributes the editor must preserve verbatim or it will silently
  break the source tool's edit semantics. The SVG namespace rules
  ([SVG 2 §1.4](https://www.w3.org/TR/SVG2/intro.html)) permit any
  foreign namespace; preserve, do not normalize.
- **CSS `transform` property vs `transform=` attribute.** Per
  [SVG 2 §7.4](https://www.w3.org/TR/SVG2/coords.html#TransformProperty):
  the CSS `transform` property "applies conceptually to the outside of
  the `svg` element" — it composes differently from the `transform=`
  attribute. Two visually identical documents can encode transforms
  in either surface; round-trip requires preserving the original.
- **Presentation attribute vs inline style cascade.** Same property
  may appear as `fill="red"` and as `style="fill:blue"` on the same
  element; the inline style wins (specificity 1,0,0,0 vs 0 for the
  presentation attribute, per
  [§6.3](https://www.w3.org/TR/SVG2/styling.html#PresentationAttributes)).
  Reading must consult both; writing must decide which surface to
  mutate and remember.
- **Percentage units.** `width="50%"` on an `<svg>` resolves against
  the host viewport; on a `<rect>` it resolves against the nearest
  viewport's _viewBox_ width/height per
  [§7.11 Units](https://www.w3.org/TR/SVG2/coords.html#Units). Resize
  via drag computes a pixel delta — converting that to a percentage
  requires the viewport context and a policy choice (preserve unit
  type vs always store user units).
- **`viewBox` vs `width`/`height`.** With both set, drag-resize at the
  document edge can mean "rescale content" (mutate `width`/`height`,
  hold `viewBox`) or "extend canvas" (mutate `viewBox`, hold
  `width`/`height`). Both are spec-valid per
  [§7.5 viewBox](https://www.w3.org/TR/SVG2/coords.html#ViewBoxAttribute);
  the editor must commit to a model and surface it.
- **`<use>` shadow tree.** Per [SVG 2 §5.6.1](https://www.w3.org/TR/SVG2/struct.html#UseShadowTree):
  the shadow tree is read-only; "Any attempt to directly modify the
  elements, attributes, and other nodes in the shadow tree must throw
  a `NoModificationAllowedError`." Per-instance edits are
  fundamentally not supported on a `<use>` clone.
- **Path `d` source fidelity.** The `d` mini-language ([SVG 2
  §9.3.1](https://www.w3.org/TR/SVG2/paths.html#PathDataBNF)) admits
  many equivalent encodings (relative vs absolute, implicit lineto,
  whitespace, sign packing). Any parse-emit cycle that does not
  preserve untouched substrings churns the source.
