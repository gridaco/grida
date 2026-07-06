---
title: Image Session
tags:
  - internal
  - wg
  - canvas
format: md
---

The image session edits one image paint on the canvas: the **placement**
of the image within the node's paint box. Placement acts on the
[normalized value model](./index.md) (`PSES-2`); this document pins down
the image paint's placement model — the canonical transform model — and
then the quad surface that manipulates the one placement it edits.

## The canonical placement model

An image paint fills a node's **paint box** — the rectangle the paint
covers on the node. All placement is defined in the box's normalized
space (the unit box `[0,1] × [0,1]`, mapped to pixels by the box size),
so placement is size-independent for the same reasons a
[gradient](./gradient.md#the-canonical-transform-model) is.

The pipeline from source pixels to a filled box is fixed:

```text
decode → orientation → placement → composite
```

### Orientation

Before any placement, the source may carry a **discrete quarter-turn**
orientation — `0`, `90`, `180`, or `270` degrees clockwise. It is a
lossless, image-space correction (it maps pixels on the integer grid, no
resampling), applied _before_ placement so that fitting sees the oriented
intrinsic size — when the turn is odd, the intrinsic width and height
swap. Orientation is a property of the pixels, not the layout; it is not a
continuous rotation (that is the free transform, below).

### The three placements

A paint's placement is **exactly one** of three mutually-exclusive kinds.
This is the crux of the model: "fit" and "free transform" are not points
on one scale — they are different placement kinds with different
parameters and different editing surfaces.

1. **Declarative fit.** A fit rule sizes the oriented image against the
   box — `contain` (fit inside, preserve aspect), `cover` (fill, preserve
   aspect, overflow cropped), `fill` (stretch to the box, aspect ignored),
   `none` (intrinsic size) — paired with an **object position**: a
   normalized anchor placing the fitted image within the box, where
   `(-1, -1)` is the top-left corner, `(0, 0)` the center, and `(1, 1)`
   the bottom-right. The rule and the anchor are the whole placement; the
   result is derived, not stored as geometry.

2. **Free transform.** An affine transform (a 2×3 matrix) in the box's
   normalized space places the image quad arbitrarily — translate, scale,
   rotate, skew. Translation is normalized to the box (independent of box
   pixels). This is the only placement with continuous, arbitrary
   geometry, and the only one the **canvas quad surface** edits.

3. **Tile.** The oriented image is composed into a **tile** (its own fit
   inside a tile cell) and the tile is **repeated** across the box, with a
   per-axis repeat mode, optional spacing, and an optional pattern
   transform on the tile grid. Tiling is a distinct intent from single
   placement — "cover + repeat" in box space is a contradiction — so it is
   its own placement kind, not a flag on fit.

### What the node contributes

The node's own transform (its position, rotation, scale in the scene)
composes **outside** the paint. Placement is defined in the node's paint
box and is invariant to the node's transform: rotating the node rotates
the box and everything in it, but does not change the stored placement.
The session works in box space and lets the node transform compose over
it.

## The canvas surface

The canvas surface edits the **free-transform** placement only —
declarative fit, object position, tile parameters, orientation, and the
image source are authored in the paint control, not on the canvas.

### The quad handles

The image quad is the paint box's corners carried through the
free-transform affine. It is edited by three handle families:

- **Side handles** (one per edge) — **scale** along the edge's axis, by
  moving the edge (its two corners) together.
- **Corner handles** (one per corner) — **rotate** the quad about its
  center.
- **Body** (the quad interior) — **translate** the quad.

Every handle gesture is applied as a change to the free-transform affine
(`PSES-2`), mapped from the pointer back into box space. Scale is rigid
about the opposite edge; rotation is rigid about the center; translation
moves the whole quad.

### Free transform and the declarative placements

The quad handles require a free-transform placement — they have no meaning
for a declaratively-fitted or tiled image, whose geometry is derived, not
authored. A conforming editor therefore presents the quad only when the
placement is free transform. It **may** promote a declarative placement to
free transform when the user first manipulates the quad, seeding the
affine from the currently-fitted quad so the promotion is visually
continuous; switching placement kinds is otherwise a paint-control edit.

### Entry

Unlike a gradient, an image fill **has** a canvas identity — the shape it
fills — so the enter idiom resolves to the image session: pointing to
descend into a shape whose fill is an image means "edit the image," and
outranks descending into the shape's own geometry. Entry is also available
from the paint control. Both are the [edit-mode](../edit-mode.md) `MODE-2`
dispatch and its exit ladder; this document specifies only the surface
inside that lifecycle.

## Contracts

- **IMG-1 — Box-normalized placement.** Image placement is defined in the
  node's paint box (unit box `[0,1]²`, mapped by box size); the stored
  placement is independent of box pixels and of the node's own transform,
  which composes outside the paint.

- **IMG-2 — Orientation is discrete and pre-placement.** Orientation is a
  lossless quarter-turn (`0/90/180/270°` clockwise) applied to the source
  before placement; an odd turn swaps the intrinsic width and height used
  by fitting. It is not a continuous rotation.

- **IMG-3 — Three exclusive placements.** A paint's placement is exactly
  one of: declarative fit (a fit rule + object position), free transform
  (a box-normalized affine), or tile (compose-then-repeat). They are
  distinct kinds, not points on one scale.

- **IMG-4 — Fit is derived.** Under declarative fit, the placement is the
  rule and the object-position anchor; the resulting geometry is derived
  from them and the intrinsic size, never stored as an affine.

- **IMG-5 — The quad edits the free transform.** The canvas quad surface
  edits the free-transform affine and nothing else; side handles scale,
  corner handles rotate about center, the body translates, each applied as
  a change to that affine (`PSES-2`).

- **IMG-6 — Quad requires free transform.** The quad handles are presented
  only for a free-transform placement. A conforming editor MAY promote a
  declarative placement to free transform on first canvas manipulation,
  seeding the affine from the fitted quad; it MUST NOT expose quad handles
  for a placement whose geometry is derived.

- **IMG-7 — Entry outranks geometry descent.** The enter idiom on a shape
  whose fill is an image opens the image session (not the shape's geometry
  edit), and the session is also reachable from the paint control (defers
  to [edit-mode](../edit-mode.md) `MODE-2`).
