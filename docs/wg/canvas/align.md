---
title: Align & Distribute
description: Alignment's reference-frame rule — selection-relative for many, container-relative for one — and equal-gap distribution, correct under rotation and mixed parents.
tags:
  - internal
  - wg
  - editor
format: md
---

Align moves selected nodes so an edge or center coincides;
distribute equalizes the spacing between them. The whole feature is
one rule plus arithmetic — the rule is *what frame you align to*,
and it flips on selection cardinality.

## The reference-frame rule

- **Two or more nodes**: the frame is the **selection's union
  bounds** (world-space AABB of all members). Align-left moves every
  member's left edge to the union's left edge; the union itself
  never moves — alignment redistributes *within* the selection.
- **One node**: the frame is the node's **parent container**, which
  stays fixed while the node moves — align-center centers the child
  in its parent. A single *top-level* node has no meaningful frame
  and the command declines.

There is no modifier and no threshold: cardinality alone picks the
frame. (The one-node case is what makes align useful at all for a
single selection; the many-node case is the classic tool.)

## Geometry

- Alignment measures **world-space axis-aligned bounds** — a rotated
  node aligns by its world AABB, not its local box.
- Deltas are computed in world space and applied as translations
  **projected into each node's own parent frame** — so alignment is
  correct when members live under different parents, including
  transformed ancestors. Mixed-parent selections are legal; each
  member moves in its own frame, the union is shared.
- Alignment never resizes, never rotates, never re-parents.

Align and distribute are **union commands**: they read the whole
selection as one set and never partition it by parent — the contrast to
the structural commands (grouping, flatten, boolean), which act once per
[selection partition](./ux-surface/selection-partition.md) (PART-3).
Mixed parents are handled by projecting each member's delta into its own
frame, not by grouping.

## Distribute

Distribute equalizes **edge-to-edge gaps** along one axis:

- Requires **three or more** members (with two there is nothing to
  distribute).
- Members are ordered by their position along the axis; the
  outermost two hold their positions; interior members move so every
  adjacent gap equals `(span − Σ sizes) / (N − 1)`.
- The selection's union bounds are invariant under distribute.

## Layout-owned members

A member whose position is owned by its parent's auto-layout flow
has nothing for align to author — the layout will immediately
override any translated position. Such members are **excluded**:
free members align, in-flow members stay, and an all-in-flow
selection declines. This is the computed-vs-authored doctrine
(properties PROP-5, [nudge](./nudge.md) NUDGE-4) applied to
alignment — changing arrangement *inside* a flow is the container's
alignment property, reachable in the [properties
panel](https://github.com/gridaco/grida/blob/main/crates/grida_editor/docs/properties.md), not a geometric align.

## Triggers and history

The align row sits at the top of the properties panel; the
keybindings are in the [sheet](https://github.com/gridaco/grida/blob/main/crates/grida_editor/docs/keybindings.md): Alt+A/D/W/S
(left/right/top/bottom), Alt+H/V (horizontal/vertical centers), and —
matching the web editor — Alt+Ctrl+V distributes **horizontally**,
Alt+Ctrl+H **vertically** (the distribute letter is the opposite axis
of the align center on the same key). Every align or distribute action
is **one
history entry** — a multi-node align undoes in one step.

## Contracts

- **ALIGN-1** Frame flip: with N≥2 the union's **aligned edge or
  center** is invariant — align-left preserves the union's left edge,
  align-center its center, etc. — and every member stays within the
  original union (alignment redistributes *inside* the frame; the
  union's extent along the aligned axis collapses, so the whole AABB is
  not preserved, only the reference edge). With N=1 the parent is
  untouched and the node lands on the parent-frame edge/center.
- **ALIGN-2** Top-level single-node align is a no-op (declines).
- **ALIGN-3** Rotation: a rotated member aligns by its world AABB —
  after align-left its world AABB's left edge equals the frame's.
- **ALIGN-4** Mixed parents: members under different (including
  transformed) parents align to the shared world frame exactly; each
  member's commit is expressed in its own parent's coordinates.
- **ALIGN-5** Distribute: N≥3 required; after distribute, all
  adjacent gaps are equal and the outermost members have not moved.
- **ALIGN-6** In-flow exclusion: members positioned by auto-layout
  flow are not translated by align/distribute; an all-in-flow
  selection declines with no entry.
- **ALIGN-7** One entry per action; undo restores every member's
  prior position in one step.
