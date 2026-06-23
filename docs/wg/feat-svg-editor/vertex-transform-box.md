---
title: "Vertex Transform Box — transform a vector sub-selection"
description: "Spec for the Vertex Transform Box: treating a multi-vertex sub-selection in path-edit as a single transformable object (translate / scale / rotate via one affine), the interaction model, the session-persistent frame, the policy, and the design questions deferred."
keywords:
  - svg
  - svg-editor
  - vector-edit
  - transform-box
  - policy-class
tags:
  - internal
  - svg
  - wg
format: md
---

# Vertex Transform Box

> Scope: vector path editing. Tracks
> [gridaco/grida#881](https://github.com/gridaco/grida/issues/881).

## Summary

In path-edit, a sub-selection of vertices can be **translated** as a set, but
there is no way to **scale** or **rotate** it. The Vertex Transform Box closes
that gap by reframing a sub-selection from "a set of points you can only move
together" into **a transformable object** — the same transform box the editor
already uses for whole elements, bound to the selected points.

When **two or more** vertices span a non-degenerate area, a box is drawn around
them and manipulating it applies **one affine** to the selected vertices (and
their tangents); unselected vertices are untouched. The box is a **vertex**
tool: a segment- or tangent-only selection does not summon it (to transform an
edge, select its endpoints).

## Interaction model

The box presents the standard transform-box handles:

- **Body → translate.** Drag the interior.
- **Edge / corner → scale.** Drag an edge (anchored at the opposite edge) or a
  corner (anchored at the opposite corner).
- **Corner ring → rotate.** Drag just around a corner; the pivot is the box
  centre.

Modifiers behave **identically to the element transform box**, so the muscle
memory transfers:

- **Alt** — scale from the box **centre** (symmetric) instead of the opposite
  edge / corner.
- **Shift** — **aspect-lock** a scale (uniform), **snap** a rotation to a fixed
  angular grid, or **axis-lock** a body translate to the dominant axis. A
  mid-drag modifier toggle (no pointer movement) updates the preview
  immediately.

### Both selection and transform from one press

The box's handles sit over the very points they bound — a corner coincides with
a selected vertex. A press there is genuinely **ambiguous**: the user may want
to _transform the box_ or to _re-select that point_. It is resolved by the
editor's standard **singleton-vs-ambiguous** rule: the press **defers**, the
drag threshold discriminates, and

- **drag → transform** the box;
- **click (release without crossing the threshold) → select the point
  underneath** — narrow to it (no shift) or toggle it (shift).

So the box claims drags while the points underneath stay click-selectable;
both interaction models coexist with no mode switch. The handles take
**precedence** over the vector controls beneath them so a grab is never stolen
by a coincident control. To keep that dual model legible, **hover previews the
click target**: the vertex a click would select lights up on hover even while
the box owns the pixel, so the user sees what the next click selects before
pressing (a spot with no selectable control underneath — over the box body, a
region — does not light up, matching its no-op click). This is the general "a
drag-claiming handle over a selectable control is ambiguous and defers" rule;
see
[selection-intent](../feat-editor/ux-surface/selection-intent.md) §"Transform
box over a sub-selection". With nothing selectable underneath (a whole-element
transform box, or a corner over empty canvas) the press is a singleton again
and a click is a no-op.

## One affine, mapped into local space

The box lives in **screen space**, but the vertices live in the element's
**local** coordinate space (which may itself be scaled, rotated, or sheared by
the element's own transform). The gesture therefore produces a screen-space
affine that must be carried into local space before it touches geometry: an
affine `A` applied in screen space is the local affine

```text
A_local = T⁻¹ · A · T
```

where `T` is the element's current screen transform (its CTM). Conjugating
through `T` means a scale or rotation composes correctly into local geometry
even when the element carries its own transform — e.g. a world-axis scale of a
rotated element shears the local points, which is the honest result.

**Tangents** of a moved vertex follow the affine's **linear part** only (the
translation is dropped, since the owning vertex already carries it) — so they
rotate / scale / shear with their vertex. A segment with only one endpoint
selected keeps its other handle fixed, deforming the curve; that is the honest
result of transforming a partial sub-selection.

## The frame is edit-session state

The box's rotation is **not** persisted geometry — vertices store only
positions and tangents. The frame is therefore **session state**, and the
choice of how long it lives is the central design decision:

> The frame is shared across **gestures** for the life of the **sub-selection**
> — not reset per gesture.

So a rotate carries into the next scale: the handles stay where the last gesture
left them, and a scale after a rotate runs along the **rotated** axes. (This
refines the original proposal of "ephemeral, recomputed axis-aligned on every
reselect" — the box would otherwise forget its orientation between two drags of
the same points, making composition impossible.)

The frame is modelled in **local space** — a fixed baseline (the geometry and
the selection's axis-aligned bounds when the frame was established) plus an
**accumulated affine**. Each gesture composes its delta onto the accumulated
affine and the geometry is **re-derived from the baseline** rather than from the
previous frame, so there is no per-gesture drift; the rendered box is the
baseline bounds under the accumulated affine, projected to screen. Holding the
frame in local space keeps it correct across camera pans / zooms and through the
element's own transform.

**Reconciliation.** The frame is kept honest by comparing the live geometry
against what the baseline-plus-accumulated would produce:

- unchanged → **keep** the frame (its rotation persists);
- a **uniform translation** of the whole sub-selection (a body drag, a
  multi-vertex point drag, a nudge, or an undo) → **absorb** the translation
  into the frame, so it follows the points while keeping its rotation;
- any other change (a different selection, a tangent / single-point edit, a
  deletion) → **reset** to a fresh axis-aligned frame.

This single invariant — "the frame tracks the geometry; a uniform translation is
absorbed, anything else resets" — is also what keeps **undo** correct without
threading the frame through history: after an undo the geometry no longer
matches, so the frame self-corrects.

The frame resets on content-edit exit.

## Policy

The transform is the policy-class **`transform-vertices`** sub-intent, accepted
only by the two vector-editable classes (vertex-chain and path). Its policy is
trivially **`bake`** on both: **count- and type-preserving** with no fork. No
vertex is added or removed, and the element keeps its tag — a transformed
zero-tangent polygon stays a polygon, a path stays a path — so there is no
`promote` and no minimum-count `restrict` (unlike `delete-vertex`). An arc whose
control geometry no longer matches its baseline demotes to a cubic at
serialization time, the same verb-honesty rule every edit obeys. See the
[policy-class glossary](./glossary/policy-class.md).

## Degenerate selections

The box's interaction shape is keyed off its bounds' dimensionality:

- **Point** (both axes collapse — one vertex, or coincident vertices) → no box;
  translate stays available by dragging the vertex directly.
- **Axis-aligned line** (one axis collapses) → the box renders as a grabbable
  strip and supports **rotation** and scale along its spanning axis.
- **Both axes non-zero** → the full transform box.

No collapsed axis may produce a divide-by-zero or `NaN`; a box that has been
dragged to zero on one axis must remain re-expandable.

## History

A transform is **one undo step**. Because it preserves the vertex count and
indices, the commit replays the _same_ sub-selection, so a single undo restores
both the prior geometry and the selection. The write goes through the same
commit path as every other vector edit, so a transform that escapes a native
tag's expressible form re-types the element to a path and undoes losslessly.

## Deferred design questions

Listed so future revisions don't relitigate them:

- **Single-axis-only scale for the line model.** A rendered line still offers a
  scale handle on its collapsed (perpendicular) axis, which spreads the
  collinear points off-axis. Restricting a line to scale only along its spanning
  axis is deferred; rotation, spanning-axis scale, and translate already work.
- **Element-frame-aligned box for rotated elements.** The box is world-axis
  aligned. An element-local-aligned box is deferred; the geometry result is
  already correct via the local-space mapping — only the box's visual alignment
  differs.
- **Snapping a body drag to sibling vertices.** A body translate composes into
  the frame (so it follows a rotation) and axis-locks under Shift, but does not
  yet snap to sibling points; dragging a vertex directly still snaps.
- **Carrying a frame across a different selection or into the element's own
  transform.** The frame is bound to one sub-selection; persisting its rotation
  beyond that is out of scope.
- **The main canvas editor.** Whether the same affordance comes to the main
  editor is a separate decision; the transform box itself is shared, so it is
  reusable there.
