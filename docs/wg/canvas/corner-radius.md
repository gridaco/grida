---
title: Corner-radius handle
description: The on-canvas handle that edits a rectangle's corner radius in place — cardinality, placement, drag mapping, clamp, and the link/split modifier.
tags:
  - internal
  - wg
  - canvas
  - editor
format: md
---

The **corner-radius handle** is on-canvas chrome that edits a node's
**corner radius** in place. It is a _property_ handle: a drag on it
changes the radius, never the node's size or position — the distinction
from the transform handles (resize, rotate), which are the surface's
default chrome and edit geometry. The interaction seam it rides — the
hit tiers, the preview→commit phase model, and the stateless-chrome
rule — is owned by [surface.md](./surface.md); this document specifies
only what the corner-radius handle adds.

## Cardinality

The same property is presented at two cardinalities:

- **Uniform (single handle)** — one handle edits a single scalar radius
  applied to all four corners, for node types (and shapes) whose radius
  is one value.
- **Per-corner (four handles)** — four handles, one at each corner
  (the four intercardinal anchors), each editing that corner's own
  radius, for node types that expose four independent corner radii.

A per-corner handle's **anchor** (which corner) is part of its identity
and feeds both the placement rule and the drag mapping.

## Placement

A corner handle sits **on the arc** of the rounded corner, at the arc's
center, so it visually tracks the roundness being edited. When the
radius is small the arc center falls too close to the node corner to
grab, so placement switches:

- **Arc-center placement** — at or above a threshold radius, the handle
  sits at the arc's center: offset inward from the node corner by the
  (scaled) radius on both axes.
- **Margin-offset placement** — below the threshold, the handle sits at
  a fixed inset from the node corner (lower-bounded so it clears the
  knob), decoupled from the tiny radius so it stays reachable.

The switch is a function of the current radius versus the threshold;
crossing it moves the handle but changes nothing about the value. The
inset is screen-space and constant in size across zoom.

## Drag and clamp

A drag resolves to a **signed scalar delta** along the corner's inward
diagonal: the dominant of the drag's two screen axes, signed from the
anchor so that dragging inward (toward the node center) **increases**
the radius and dragging outward decreases it. The uniform handle uses
the same rule against a single axis.

The committed radius is **clamped** to `[0, min(width, height) / 2]` —
non-negative, and no larger than half the node's smaller side (a larger
radius is geometrically meaningless). The clamp applies on **every**
preview, so the value the user sees never exceeds the node.

## Link vs. split

The per-corner handle carries a modifier that chooses whether a drag
edits **one corner** or **all four**:

- **Link (default, no modifier)** — while the four corners are
  currently **equal**, dragging any one corner drives all four together,
  keeping them uniform. A uniformly rounded rectangle stays uniform.
- **Split (modifier held, or corners already unequal)** — the drag
  edits only the anchored corner. Holding the modifier forces split even
  when the corners are equal; once they are unequal, split is implied
  and the modifier is no longer needed.

The rule: **link iff (corners uniform ∧ modifier absent)**; otherwise
split. "Round all corners the same" is the zero-effort path; "round one
differently" is the deliberate, modifier-gated path — with no mode
toggle.

## Readout

While a drag is active, a decorative label shows the live radius next to
the handle being dragged, and only that handle. It is pure chrome — no
hit region — and vanishes on commit or abort, exactly like the
measurement readout ([measurement.md](./measurement.md)).

## Deferred

- **Multi-selection.** Specified for a single bound node; editing corner
  radius across a heterogeneous multi-selection is out of scope.
- **Rotated-node placement.** Placement assumes an axis-aligned node
  frame; the local-frame placement for a rotated node follows the
  transform handles' rotated treatment ([surface.md](./surface.md)) and
  is deferred with it.

## Contracts

- **CRAD-1** Binding presence: the handle is present in the hit registry
  **iff** the selection is a single node whose type carries a corner
  radius; absent otherwise.
- **CRAD-2** Radius only: a drag's committed delta lands in the corner
  radius, never in the node's transform (position/size/rotation) — a
  property edit, not a geometry edit.
- **CRAD-3** Clamp on preview: the radius lies in
  `[0, min(width, height) / 2]` on **every** previewed value, at every
  zoom.
- **CRAD-4** Placement switch: arc-center placement at or above the
  threshold radius, margin-offset below it; crossing the threshold
  relocates the handle without changing the value.
- **CRAD-5** Link/split: with the four corners uniform and no modifier
  held, a corner drag drives all four equally; with the modifier held,
  or the corners already unequal, it drives only the anchored corner.
- **CRAD-6** Drag direction: dragging inward increases the radius and
  outward decreases it, with the sign derived from the anchored corner.
