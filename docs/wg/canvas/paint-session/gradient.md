---
title: Gradient Session
description: The canonical gradient transform model — a per-type normalized gradient space mapped to the object by a user transform and the node's size — and the control-point frame and color-stop track that edit it on the canvas.
tags:
  - internal
  - wg
  - canvas
format: md
---

The gradient session edits one gradient paint on the canvas: its
**geometry** (where the ramp runs, how it is oriented and scaled) through
a control-point frame, and its **ramp** (the ordered colors) through a
stop track. Both act on the [normalized value model](./index.md)
(`PSES-2`); this document pins down the gradient's normalized space — the
canonical transform model — and then the surface that manipulates it.

## The canonical transform model

A gradient is defined in a **unit gradient space**: the axis-aligned unit
square, coordinates `[0,1] × [0,1]`. Every gradient's geometry is fixed in
this space, identically for all nodes, and only then mapped to a
particular object. This is the single fact that makes gradients
resolution-independent, and the model a conforming editor must share.

### Per-type normalized geometry

The four gradient types differ **only** in how a color-ramp position
`t ∈ [0,1]` is assigned to a point of unit gradient space. The center of
the space is `(0.5, 0.5)`.

| Type        | Ramp domain (`t ∈ [0,1]`)                                                                                                    |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------- |
| **Linear**  | A straight axis. `t = 0` at the start point `(0, 0.5)`, `t = 1` at the end point `(1, 0.5)`; `t` is the projection onto that axis. |
| **Radial**  | Concentric circles about `(0.5, 0.5)`. `t = 0` at the center, `t = 1` on the unit circle of radius `0.5`.                    |
| **Diamond** | Concentric squares (an L∞ metric) about `(0.5, 0.5)`. `t = 0` at the center, `t = 1` on the square inscribed to the unit box. |
| **Sweep**   | Angular about `(0.5, 0.5)`. `t = 0` at a reference direction, increasing **clockwise**, `t = 1` after a full `360°` turn.    |

These are _base_ geometries — the identity pose of each type. A gradient
is rarely left in its base pose; it carries a transform that moves it.

### The user transform

A gradient carries a **user transform**: an affine transform (a 2×3
matrix) expressed **in unit gradient space**, about the center
`(0.5, 0.5)`. It rotates, scales, skews, and translates the base geometry
within the unit square. All non-trivial orientation lives here — never
baked into the ramp domain, the center, or a per-type radius. The base
geometry plus the user transform is the complete normalized definition of
the gradient's shape.

### Mapping to the object

The normalized gradient is mapped to a node by composing the user
transform with the node's size, in this order:

```text
object_matrix = scale(width, height) × user_transform
```

`scale(width, height)` stretches the unit square onto the node's paint
box. Two consequences follow, and both are load-bearing:

- **Non-square nodes make round types elliptical for free.** A radial or
  sweep gradient stays a unit circle in gradient space; `scale(w, h)`
  with `w ≠ h` renders it as an ellipse. The gradient is not re-authored
  to fit a rectangle — the mapping does it.
- **The stored value is size-independent.** The same user transform and
  ramp render correctly at any node size; resizing the node re-runs the
  mapping and changes nothing stored.

### The ramp

The ramp is an **ordered list of stops**, each a pair `(offset, color)`
with `offset = t ∈ [0,1]`. Stops are ordered by offset. A gradient is a
gradient only with **at least two** stops; the ramp is evaluated by
interpolating color between adjacent stops across the type's ramp domain.

## The canvas surface

The session renders a **control-point frame** and the **stops** on the
canvas, both obtained by mapping the normalized value out through the
`object_matrix` above. Editing is the inverse: a pointer position is
mapped back into unit gradient space, and the result is written to the
user transform or a stop offset.

### The control-point frame

The frame is the handles the user drags. Its shape and its drag rules
differ by kind, because a **linear** gradient is a 1-D axis while the
others are an **ellipse** with a center.

**Linear** — two handles, the **start** (origin) and **end** (primary)
of the axis. Each moves **freely and independently**: dragging one
follows the cursor and leaves the other where it is. There is no minor
extent, so no third handle.

**Radial / diamond / sweep** — three handles, the control points of the
gradient's ellipse:

- **center** (origin) — the ellipse center. Dragging it moves the
  center and **holds the major endpoint** fixed, so the major axis
  re-orients around the moved center; the minor endpoint re-derives (see
  below). It does **not** translate the whole gradient.
- **major** (primary) — the major-axis endpoint. It moves **freely** in
  2D, setting the major axis's **rotation and length** at once; the
  center is held.
- **minor** (secondary) — the minor-axis endpoint. It **slides along the
  one perpendicular direction** through the center (it cannot leave that
  line), setting only the minor extent.

When either the center or the major endpoint moves, the **minor endpoint
is re-derived**: kept perpendicular to the new major axis, on the side it
was on, with its length scaled by how much the major length changed. So
the minor stays perpendicular by construction — the ellipse scales and
rotates but never skews. The perpendicular is measured in the node's own
box (aspect-correct on a non-square node), not in the abstract unit
square.

Every frame edit is expressed as a change to the **user transform**
(`PSES-2`) — never as a change to the base geometry or the ramp. The frame
is the user transform made visible. The ellipse the frame implies — the
unit circle carried through the frame, i.e. major radius `|origin→primary|`,
minor radius `|origin→secondary|`, oriented along origin→primary — is
**drawn only for sweep**, where the stops ride it. For radial and diamond
the ellipse is **virtual**: it governs the control model (the minor handle,
the re-derivation) but is not rendered — only the axis and the handles show.

### The stop track

Each stop is placed at the point of the **ramp path** for its offset:

- **Linear, radial, diamond** — along the axis `origin → primary`
  (`t = 0` at origin, `t = 1` at primary). For radial and diamond this is
  the center→edge radius.
- **Sweep** — on the ring, at the angle `2π·t` from the primary direction:
  `origin + cos(2π·t)·(primary−origin) + sin(2π·t)·(secondary−origin)` —
  which runs from primary toward secondary, i.e. clockwise in the screen's
  downward-y, matching the ramp-domain table.

A stop is **presented** as a color chip — a small square filled with the
stop's color, rotated to the track. Its placement depends on the ramp
shape:

- **Straight axis (linear, radial, diamond)** — the chip **floats** a
  fixed screen distance off the ramp point along the axis perpendicular,
  its caret pointing back at its ramp point. Floating it off a straight
  line keeps it clear of the line and lets an endpoint stop be grabbed
  without fighting the frame handle there.
- **Sweep** — the chip **rides the ring** at its ramp point, floated a
  small distance **radially outward** so the ring line does not cut
  through it, its caret pointing at the gradient center; the color still
  aligns with the rendered color at that angle.

Either way the chip is **hit where it is drawn**. One stop is the
**selected** stop (ringed in the accent, its caret filled); the panel
color control edits that stop's color.

- **Insert.** Hovering the ramp path (not on a chip or a frame handle)
  shows a translucent **preview** chip at the pointed offset, with an
  **offset-% badge** beside it — so the user sees exactly where and what a
  click would insert before committing. Pressing inserts a stop there; the
  new stop takes the ramp's interpolated color at that offset and becomes
  selected.
- **Move.** Dragging a chip changes its stop's offset, clamped to `[0,1]`.
  The list stays **ordered by offset** throughout the drag: when the
  dragged stop passes a neighbor the two swap order. The dragged stop
  **keeps its identity** — it is the same stop being moved before and
  after a crossing (the selection follows it to its new position), never a
  different stop that happens to now sit where it was. Dragging onto a
  neighbor's **exact** offset places the dragged stop **just after** that
  neighbor — a deterministic tie-break, so equal offsets never leave the
  order ambiguous.
- **Remove.** Removing the selected stop (its delete gesture) drops it —
  except that a gradient holds **at least two** stops, so the removal that
  would leave one is refused.
- **Select.** Pressing a chip makes its stop the selected stop.

### Entry

A gradient has no canvas-hit identity distinct from the node that carries
it, so a gradient session is **not** reachable by pointing at the canvas.
It is entered only from the paint's own control, and the enter idiom never
opens it — the [edit-mode](../edit-mode.md) `MODE-2` dispatch. This
document does not restate that lifecycle; it specifies the surface that
lives inside it.

Exit is the [edit-mode](../edit-mode.md) ladder (Escape; collapsing the
control). As a convenience the surface adds one exit gesture that does not
enter: a **double-click on empty canvas** ends the session, the enter
idiom's inverse — the same shape the vector mode uses (`VEC-13`). It never
fires on a handle, a chip, or the track, so it cannot interrupt editing.

## Contracts

- **GRAD-1 — Unit gradient space.** Every gradient type's geometry is
  defined in the unit square `[0,1]²` about center `(0.5, 0.5)`, per the
  ramp-domain table, independent of any node. A conforming editor stores
  no object-space geometry for a gradient.

- **GRAD-2 — User transform in gradient space.** All orientation, scale,
  skew, and translation of a gradient is carried by a single affine user
  transform expressed in unit gradient space; the base geometry, center,
  and ramp domain are never mutated to achieve them.

- **GRAD-3 — Size mapping.** A gradient is mapped to a node by
  `scale(width, height) × user_transform`; the stored value is unchanged
  by resizing the node, and a round type on a non-square node renders
  elliptical without re-authoring.

- **GRAD-4 — Frame roles.** Linear exposes two handles — the free,
  independent start (origin) and end (primary) of the axis; there is no
  secondary. The elliptical types expose the ellipse's {center=origin,
  major=primary, minor=secondary}; the minor exists iff the type is
  elliptical and stays perpendicular to origin→primary.

- **GRAD-5 — Frame drag model.** Every frame gesture is applied as a
  change to the user transform (`PSES-2`), never to the base geometry or
  the ramp, and per role: **linear** — each endpoint follows the cursor
  independently, holding the other; **elliptical** — dragging the center
  holds the major endpoint, dragging the major endpoint holds the center,
  and either re-derives the minor perpendicular (length scaled by the
  major-length change); the minor endpoint moves only along the
  perpendicular through the center. The perpendicular is measured in the
  node's box, so it is aspect-correct.

- **GRAD-6 — Ramp is ordered ≥2 stops.** The ramp is stops
  `(offset ∈ [0,1], color)` ordered by offset, with at least two stops;
  the removal that would leave fewer than two is refused.

- **GRAD-7 — Stop track gestures.** Hovering the ramp path shows a preview
  chip + offset-% badge at the pointed offset; pressing there inserts a
  stop at that offset and selects it. Dragging a chip changes its offset
  clamped to `[0,1]`; the list stays ordered and the dragged stop **keeps
  its identity** across a neighbor crossing (the selection follows it),
  with equal offsets broken deterministically (the dragged stop lands just
  after the neighbor). A stop can be selected, and the selected stop is the
  target of the color edit.

- **GRAD-8 — Entry is control-only.** A gradient session is reachable only
  from the paint control, never by pointing at the canvas, and the enter
  idiom never opens it (defers to [edit-mode](../edit-mode.md) `MODE-2`).

- **GRAD-9 — Ramp path + chip placement per type.** A stop's ramp point
  is on the `origin→primary` axis for linear/radial/diamond and on the
  ring at angle `2π·offset` for sweep. The ring is **drawn only for sweep**
  (virtual for radial/diamond). The chip is **floated off** the ramp point
  with its caret pointing back at it for the straight-axis types, and
  floated **radially off the ring** (caret at the center) for sweep so it
  rides the arc without the ring cutting through it; either way it is hit
  where it is drawn.
