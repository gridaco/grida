---
title: Vector Edit
description: The vector content-edit mode and the pen — the network model, sub-selection, hover-armed projection, bending, tangent mirroring, and the disconnect-not-exit escape semantics.
tags:
  - internal
  - wg
  - editor
format: md
---

**Vector edit** is the nested editing context for a vector node's
geometry, and the **pen** is the authoring flow that runs inside it.
It is the editor's most interaction-dense mode: every pointer state —
hover, snap, projection, drag — carries meaning, and most keys mean
something different here than outside. This document specifies the
mode from the production editor's semantics; the [tool](../canvas/tool.md)
taxonomy defers the pen to exactly this spec.

## The model — vector network

The edited material is a **vector network**, not a path:

- **Vertices** — points in the node's local space.
- **Segments** — ordered pairs of vertex references with two tangent
  vectors, one per endpoint, expressed *relative to that endpoint*.
  A segment is a cubic Bézier whose control points are
  `endpoint + tangent`; a segment with both tangents zero is a
  straight line, and its handles do not render.
- **Regions** — the closed faces of the planarized network, derived
  (never authored directly), and fillable.

A network is a graph: vertices may join more than two segments,
subpaths may branch and merge. This is strictly more expressive than
a path command sequence, and the difference drives the *reduced
profile* at the end of this document. Model invariants that gestures
rely on: splitting a segment at a parametric point preserves the
curve's shape exactly (subdivision), and straight segments split into
straight segments (zero tangents stay zero — no phantom handles).

## The mode

Vector edit is a **content mode** in the editor's exclusive
[edit-mode slot](../canvas/edit-mode.md), scoped to exactly one node:

- **Entry**: double-click a vector node (the [targeting](../canvas/ux-surface/targeting.md)
  descend-then-enter idiom), or arm the pen tool — with a vector
  selected it edits that node; with none, the first placement creates
  a new vector node and enters the mode. Double-clicking a primitive
  shape flattens it to a vector first: entering the mode is a
  commitment. (One dispatch exception: a shape carrying an *image
  fill* double-clicks into the image paint session instead — the
  [edit-mode](../canvas/edit-mode.md) dispatch table owns that priority.)
  The variable-width lens over the same node is the mode's **width
  facet**, specified there as well.
- **Mode state**: the sub-selection (vertex indices, segment indices,
  and *tangents* addressed as vertex + side), one hovered control at
  most, the pen's origin vertex and pending tangent (below), and the
  snapped cursor.
- **Exit** follows the escape ladder (below), or a **double-click on
  empty canvas** — the enter idiom's inverse; a double-click on the
  network's own controls stays editing. Either way the exit runs the
  full lifecycle below and restores the document selection to the
  world above.

Lifecycle invariants:

- The network is snapshotted at entry. Exiting with no effective
  change restores the node **exactly** — enter-and-leave is a no-op,
  in document bytes and in history.
- Exit normalizes: duplicate vertices and segments are merged, unused
  vertices dropped.
- Exit with degenerate content (fewer than 2 vertices or 1 segment)
  **deletes the node**: empty authoring leaves no trace (the same
  doctrine as TOOL-6/7). For a node the mode itself created, *no
  trace* is literal — every entry of the authoring frame is rescinded
  from history. A **pre-existing** node cannot vanish untraceably:
  the mode-era entries are rescinded and exactly one deletion entry
  survives, whose undo restores the original node — an unrecorded
  delete of pre-existing content would be data loss.
- **Bounds refit**: after every mutation the network is re-anchored
  so the node's position and size hug the geometry — vertices stay in
  a tight local box, and the geometry's *world* position never shifts
  as a side effect of the refit.

## Chrome and hover

The mode's chrome inventory: vertex dots (idle / hovered / selected),
segment bodies with generous invisible hit strips, tangent knobs with
hairline connectors to their vertex, region fills, the projected
cursor point, the marquee's sweep rect (the document marquee's
chrome, owned by the mode while inside), and the pen's preview curve.

- **Tangent visibility is a neighbourhood rule**: knobs render only
  for selected vertices and their one-hop neighbours, and never for
  zero tangents. Everything else stays clean — handle clutter is the
  mode's main legibility risk.
- **Hover is exclusive and load-bearing**: at most one control
  (vertex or segment) is hovered. Hovering a segment *arms*
  projection: the nearest point on the curve (parametric `t`) is
  computed and shown as an insertion affordance. Vertex snapping uses
  a tighter threshold than segment projection and **suppresses** it —
  near a vertex, the vertex wins; a point on a segment is never
  offered on top of its own endpoint.
- **Hover is an idle affordance**: a promoted drag captures the
  pointer, clearing hover — and the projection riding it — for the
  gesture's duration; the release re-resolves both against the
  geometry as the gesture landed it. A keyboard mutation that moves
  geometry out from under the pointer (delete, nudge) drops the pair
  the same way. Chrome never shows a hover affordance anchored to
  pre-gesture geometry.

## Sub-selection

- Click selects a vertex or segment; the toggle modifier is additive
  (the same grow/shrink discipline as document selection).
- **Lasso** (its tool key is legal only inside this mode) and marquee
  select in bulk: vertices by point-in-region, segments by curve
  containment; tangent knobs are eligible only when their vertex is
  already in the selection neighbourhood. The sweep applies **live**:
  the sub-selection tracks the rect as it grows *and shrinks* —
  additive sweeps union against the selection as it stood at sweep
  start. Release just lands the gesture; a mid-sweep abort restores
  the sweep-start selection.
- **Delete** removes the sub-selection: deleting a vertex removes it
  *and every incident segment* — incident segments are not bridged.
  Deleting a segment keeps its vertices (orphans are cleaned at
  exit).

## The pen

Pen state is two nullable values: the **origin vertex** `A` (where
the next segment leaves from) and the **pending tangent** `T` (the
origin-side tangent the next segment will be born with). The pen is
**projecting** whenever `A` is set: a rubber-band preview curve runs
from `A` to the snapped cursor, using `T` as its origin tangent — the
preview is an honest render of the segment a click would create.

**Click** resolves by snap priority:

1. **On a vertex** — if not projecting, adopt it as `A` (this is how
   an open end is *continued*); if projecting, connect `A` to it.
   Connecting to the current subpath's start **closes the loop** and
   concludes the path (`A := null`) — unless the *keep-projecting*
   modifier is held, in which case `A` moves to the landing vertex
   and drawing continues through it.
2. **On a segment** — split it at the projected parametric point
   (shape-preserving), then treat the new vertex as case 1.
3. **Free space** — append a vertex at the snapped cursor; if
   projecting, also create the segment `A → new`, consuming `T` as
   its origin tangent; `A := new`.

**Drag** shapes tangents at both ends of the flow — the pen can
*start* with a drag and *end* with one:

- **Pre-tangent**: pressing and dragging at a placement pulls a
  tangent *before any segment exists* — the drag accumulates `T`, so
  the first segment leaves the first vertex already curved.
- **Post-tangent**: dragging on a placement that completed a segment
  shapes that segment's end tangent live, and mirrors it into
  `T := −tangent` — so the *next* segment departs smoothly. The
  mirror is why consecutive pen-drag placements produce a smooth
  spline by default.

**Escape disconnects; it does not exit.** Esc while projecting clears
`A`, `T`, and the sub-selection — the rubber band vanishes — but the
tool stays armed and the mode stays open. The next click starts a new
**disconnected subpath inside the same node**. This is the pen's
version of "step down one rung" (the full ladder is below).

## Editing gestures

With the cursor tool inside the mode:

- **Vertex drag** translates the sub-selected vertices (and any
  sub-selected tangents) as one gesture — with axis lock, snapping,
  and the snap-disable modifier behaving as in document translate.
- **Segment drag translates**: dragging a segment's body moves the
  segment — its two endpoints ride the same translate gesture as a
  vertex drag (an unselected segment is selected first). A plain
  drag never deforms the curve.
- **Tangent drag** moves one control handle under a **mirroring
  mode**: `auto` (infer from the current geometry — collinear
  opposite tangents move as smooth, otherwise independent), `all`
  (mirror angle and length), `angle` (mirror angle, keep the opposite
  length), `none` (independent). The mirroring mode is a live gesture
  modifier.
- **Bend modifier** (a momentary hold, legal only in this mode) is
  where deformation lives: clicking a vertex toggles it corner ⇄
  smooth; dragging a vertex pulls a symmetric tangent pair out of
  it; dragging a **segment's body** deforms the curve through the
  grab point — a straight segment becomes curved (its tangents leave
  zero), a curved one adjusts, and the grab point's parametric
  position weights how the deformation distributes to the two
  tangents.
- **Insert on segment**: the pen's split (case 2) and the hover
  insertion affordance both add a vertex mid-segment,
  shape-preserving.

## Escape ladder and keys

Inside the mode, Esc steps down exactly one rung per press:

1. sub-selection or projection active → clear both (**disconnect**);
2. a non-cursor tool armed → revert to cursor;
3. otherwise → **exit the mode**.

Outside the mode the ladder is tool → deselect. Delete, arrows
(nudge), and the tool keys resolve against the mode first — the
same key, different meaning, arbitrated as specified in
[routing](https://github.com/gridaco/grida/blob/main/crates/grida_editor/docs/routing.md).

## Snapping

The pen cursor and every drag snap against the network's own
geometry (vertices first, then hovered-segment projection) and the
scene's guides. Thresholds are screen-space (zoom-invariant). The
full source/threshold/chrome spec for vector-mode snapping is
[snap-vector](./snap-vector.md); it composes with the document-level
[snap](../canvas/snap.md) family.

## The reduced profile — editing without authoring

The operation set splits cleanly:

- **Editing**: translate vertices/segments, bend, tangent edit,
  multi-vertex transform, delete.
- **Authoring**: append, connect, split, close — everything that
  changes topology from the pen.

A host whose document model is a *path command sequence* rather than
a network can implement the editing profile alone: moves re-emit the
same commands with new coordinates, and curve-introducing edits
lazily promote primitive shapes to path form on first commit. This
split is proven in production — the SVG document editor ships exactly
the editing profile, because a command sequence cannot express the
pen's topology changes without a rewrite. The reference editor
targets the **full profile**; the split defines what a minimal
conformer must implement and why the pen demands the network model.

## Contracts

- **VEC-1** Entry identity: entering and exiting the mode with no
  committed gesture leaves the document byte-identical and history
  untouched.
- **VEC-2** Degenerate cleanup: exiting with fewer than 2 vertices or
  1 segment deletes the node; no authoring-frame entry survives. A
  node the mode created leaves zero entries; a pre-existing node
  leaves exactly one — the deletion, whose undo restores the
  original.
- **VEC-3** Refit invariance: after any committed mutation, the
  node's bounds equal the network's tight bounds and every vertex's
  world position is unchanged by the refit itself.
- **VEC-4** Escape disconnects: with the pen projecting, one Esc
  clears the origin and pending tangent while the mode and tool
  survive; the following click starts a disconnected subpath in the
  same node.
- **VEC-5** Close semantics: clicking the subpath's start while
  projecting closes the loop and concludes; with keep-projecting
  held, the origin moves to the landing vertex instead.
- **VEC-6** Split preserves shape: inserting a vertex on a segment
  leaves the rendered geometry pixel-identical; splitting a straight
  segment yields two straight segments.
- **VEC-7** Smooth continuation: a placement drag mirrors the end
  tangent into the pending tangent, and the next placed segment
  departs collinearly.
- **VEC-8** Vertex-over-segment: within the vertex snap threshold of
  an endpoint, the pen resolves to the vertex, never to a projected
  point on its segment.
- **VEC-9** Delete removes incident segments: deleting a vertex of
  degree N removes exactly N segments and bridges nothing.
- **VEC-10** Tangent mirroring: in `all` mode the opposite tangent is
  the exact negation; in `angle` mode it is collinear with its length
  preserved; in `none` it is untouched; `auto` resolves to smooth iff
  the tangents were collinear at gesture start.
- **VEC-11** One entry per committed gesture — a placement click, a
  drag, a delete — and gesture abort restores the pre-gesture
  network exactly.
- **VEC-12** Hover exclusivity: at most one control is hovered;
  segment projection is computed only while its segment is hovered.
  Both clear while a gesture holds the pointer and re-resolve on
  release — no hover chrome ever anchors to pre-gesture geometry.
- **VEC-13** Double-click exit: a double-click on empty canvas exits
  the mode through the full exit lifecycle (VEC-1/2 cleanup
  included); a double-click on any of the mode's controls does not
  exit.
- **VEC-14** Live marquee: while the sweep is in flight the
  sub-selection equals the swept set (unioned with the sweep-start
  selection when additive) — growing adds, shrinking removes.
  Release changes nothing further; a mid-sweep abort restores the
  sweep-start selection exactly.
