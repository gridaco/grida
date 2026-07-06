---
title: Variable Width
description: The variable-width stroke profile — width stops parameterized along a path, their interpolation into a stroke outline, and the width facet that authors them.
tags:
  - internal
  - wg
  - vector
  - editor
  - painting
format: md
---

**Variable width** lets a stroke's thickness vary along the path it
follows, instead of holding one constant width. The material is a
**width profile**: a small ordered set of **stops**, each pinned to a
position along the curve and carrying a thickness. This document
specifies the profile model, how it interpolates into the rendered
stroke outline, and the authoring **facet** that edits it.

It specifies only the width delta. The vector network it rides — the
vertices, segments, and tangents that define the path — is the
[vector-edit](./vector-edit.md) model (`VEC-*`), and the exclusive
edit-mode slot the facet occupies is the
[edit-mode](../canvas/edit-mode.md) slot: the width facet is that
document's **MODE-4**, a lens nested inside vector editing, not a
second mode. This spec defers both and models the profile alone.

## The model — width profile

A **width profile** is an ordered sequence of **width stops** over one
node's path. It is authoring material attached to the node's stroke
geometry, not a separate node.

A **width stop** is:

- **Position `u`** — a scalar in `[0, 1]` naming where the stop sits
  along the path. `u = 0` is the path's start, `u = 1` its end;
  `u` runs over the **whole** path arc, spanning all of its segments,
  not one segment's local parameter. Mapping `u` to a concrete point
  and tangent is the network's job — a monotone traversal of the
  ordered segments — and is defined by the path, not by the profile.
- **Width** — the stroke half-extents at that position, expressed as a
  **left** and a **right** radius measured perpendicular to the path
  tangent. The two may differ: a profile is **possibly asymmetric**.
  The **symmetric** case (left equals right) is the common one and the
  reduced baseline (`VWID-9`): a conformer that stores a single radius
  per stop implements the symmetric profile and reads asymmetric
  widths as their mean.

Profile invariants:

- **Ordering**: stops are kept sorted by `u`. Re-sorting on `u` change
  is part of the model, not an authoring nicety — the interpolation
  below assumes monotone `u`.
- **Endpoints implied, not required**: a profile need not carry a stop
  at `u = 0` or `u = 1`. Positions before the first stop and after the
  last are covered by the clamp rule below, so any non-empty profile
  yields a total width function over the whole path.
- **Floor**: a profile has a minimum stop count below which it ceases
  to be a profile. Removing the last stop that would breach the floor
  is refused, not obeyed (`VWID-6`) — variable width with no stops is
  not a zero-width stroke, it is the absence of a profile, and the
  stroke falls back to its constant width.

## Interpolation and the outline

The profile defines a **width function** `w(u)` over `[0, 1]`,
sampled from the stops:

- **Between stops**: `w` interpolates monotonically between the two
  bracketing stops' widths — left against left, right against right —
  as `u` advances from the lower stop to the higher. Interpolation is
  per-side, so an asymmetric profile stays asymmetric between stops.
- **Outside the stops**: before the first stop and after the last, `w`
  **clamps** — it holds the nearest stop's width flat. No
  extrapolation past the endpoints.
- **Single stop**: a one-stop profile is a constant `w` equal to that
  stop's width — variable width degenerates to uniform width, which is
  legal (it is the floor, `VWID-6`).

The width function shapes the **stroke outline**: at each point along
the path the stroke's boundary is offset from the path by `w`'s left
value on one side and its right value on the other, both perpendicular
to the path tangent at that point. The result is a filled outline
whose thickness breathes along the curve. This spec fixes _what_ the
outline expresses (the profile evaluated per-side, perpendicular to
the tangent); the rasterization of that outline — joins, caps, and the
sampling density along curved segments — is the stroke rendering
concern and is not restated here.

The profile **binds to the stroke geometry**, not to a fill: it is a
property of _how the node's stroke is outlined_. A node with no width
profile strokes at its constant width; a node with a profile strokes
at `w(u)`. Binding is one profile per node's stroke geometry — the
profile addresses the same path the stroke already follows, so it
needs no independent geometry of its own.

## The width facet

Editing a profile happens in the **width facet** — the width lens over
a vector node, nested inside its vector edit context. The facet's
entry, its place in the exclusive slot, and its Escape behavior
(Escape lands on the geometry facet of the same node, never on plain
selection) are [edit-mode](../canvas/edit-mode.md) **MODE-4**. This
section specifies only what the facet _does to the profile_.

The facet is subject-pinned to one node and shows the node's path as
inert reference chrome — the vertices and segments render, dimmed and
non-interactive, so the author sees the curve the stops ride without
being able to edit topology from here. Topology edits belong to the
geometry facet.

**Facet state**: the working profile, the selected stop (at most one),
and — while idle — a **projected insertion point**: the nearest point
on the path to the cursor, shown as an add-here affordance, the same
hover-armed projection idiom the pen uses on segments
([vector-edit](./vector-edit.md)). The projection is suppressed while
a gesture holds the pointer.

### Stop chrome

Each stop renders as three linked controls perpendicular to the path:

- a **center handle** on the path at the stop's `u`;
- a **left** and a **right width handle**, offset from the center by
  the stop's left and right radius along the path's perpendicular; and
- a **connector** drawn between the two width handles through the
  center — a visual readout of the stop's total thickness and its
  perpendicular orientation.

The controls re-orient live: the perpendicular follows the path
tangent at `u`, so the handles always straddle the curve squarely as
the stop slides or the curve bends.

### Stop operations

- **Add**: placing at the projected insertion point inserts a stop at
  its `u`, born with a width sampled from the current width function at
  that `u` — a new stop does not kink the outline, it lands flush with
  the existing profile and can then be dragged. Insertion keeps the
  stops sorted.
- **Select**: clicking a stop's controls selects it; at most one stop
  is selected at a time.
- **Slide** (translate along the path): dragging a stop's **center
  handle** moves the stop along the curve — its `u` changes, its width
  is carried unchanged. The center stays **on the path**: the drag
  projects to the nearest point on the curve and snaps to the path's
  own geometry (its vertices and the projected point), so a stop
  cannot leave the curve it parameterizes. Re-crossing another stop's
  `u` re-sorts the profile; the width function follows the new order.
- **Set width** (resize perpendicular): dragging a **width handle**
  changes that side's radius. Motion is projected onto the path's
  **perpendicular** at the stop — only the perpendicular component
  moves the handle, so dragging along the curve does not change width.
  Each side is independent: the left handle sets the left radius, the
  right handle the right, and asymmetry is authored by moving them
  apart. (A conformer holding the symmetric baseline moves both sides
  together.)
- **Remove**: deleting the selected stop removes it, subject to the
  floor (`VWID-6`) — a delete that would drop below the minimum stop
  count is refused.

### Preview and commit

The facet previews live and commits once. A slide or a width drag
updates the working profile continuously — the outline re-renders each
frame under the cursor — while the profile as it stood at gesture
start is retained. Aborting a gesture restores that start profile
exactly; releasing lands the gesture. The facet also retains the
profile as it stood at facet **entry**, so a facet visited and left
with no effective change is a no-op on the node. The history framing
of these commits — how a gesture becomes one undoable step, and how an
untouched facet leaves history clean — is the edit-mode slot's domain
([edit-mode](../canvas/edit-mode.md) MODE-7) and is deferred there;
this spec fixes only the preview/commit _boundary_ (`VWID-8`).

## Deferrals

- The path itself — vertices, segments, tangents, the pen, sub-
  selection, bend — is [vector-edit](./vector-edit.md) (`VEC-*`).
  The width facet never edits topology.
- The exclusive edit-mode slot, facet entry, Escape nesting, and the
  authoring-context history domain are
  [edit-mode](../canvas/edit-mode.md) (MODE-4, MODE-7). This spec does
  not restate the slot mechanics.
- The rasterization of the outline — joins, caps, sampling — is the
  stroke rendering concern; this spec fixes only the profile the
  outline expresses.

## Contracts

- **VWID-1** Profile model: a width profile is an ordered set of stops
  over one node's path; each stop is a position `u ∈ [0, 1]` over the
  whole path arc plus a left and a right radius. Stops are kept sorted
  by `u`.
- **VWID-2** Width function: the profile defines `w(u)` that
  interpolates monotonically per-side between bracketing stops and
  clamps flat outside the first and last stop; a single-stop profile
  is constant.
- **VWID-3** Asymmetry: left and right radii are independent and
  interpolate independently; a profile with unequal sides stays
  asymmetric between its stops.
- **VWID-4** Outline binding: the stroke outline is offset from the
  path by `w`'s left and right values, each perpendicular to the path
  tangent at that point; the profile binds to one node's stroke
  geometry and needs no geometry of its own.
- **VWID-5** Slide stays on the path: sliding a stop changes only its
  `u` and keeps its center on the curve (projected + snapped to the
  path's geometry); its width is carried unchanged; re-crossing
  another stop re-sorts the profile.
- **VWID-6** Floor: a profile has a minimum stop count; a remove that
  would breach it is refused. A one-stop profile is legal and reads as
  a constant width; a profile is never emptied into a zero-width
  stroke.
- **VWID-7** Perpendicular width: dragging a width handle moves only
  along the path's perpendicular at the stop and sets exactly that
  side's radius; motion along the tangent leaves the width unchanged.
- **VWID-8** Live preview, single commit: a stop gesture previews the
  working profile continuously; abort restores the gesture-start
  profile exactly, release lands it; a facet entered and left with no
  effective change leaves the profile identical.
- **VWID-9** Symmetric baseline: a conformer that stores one radius per
  stop implements the symmetric profile — left equals right at every
  stop, both width handles move together, and asymmetric input reads as
  the mean of its sides.
- **VWID-10** Insert flush: adding a stop at the projected insertion
  point samples its width from the current `w(u)`, so insertion does
  not change the rendered outline until the new stop is subsequently
  moved.
