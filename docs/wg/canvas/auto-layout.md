---
title: Auto-layout (command)
description: The command that converts a selection into a laid-out flex container — one per selection partition — by wrapping and inferring the layout from the members' arrangement.
tags:
  - internal
  - wg
  - editor
format: md
---

Auto-layout is [grouping into a container](./grouping.md) **plus a
guessed layout**: it wraps the selection into a flex container and
infers the container's direction, spacing, and alignment from how the
members are already arranged. Like every wrap, it runs once per
[selection partition](./ux-surface/selection-partition.md). The command
is `Shift+A` ([keybindings](https://github.com/gridaco/grida/blob/main/crates/grida_editor/docs/keybindings.md)).

This document specifies the **command** — the wrap and the inference.
The layout *model* it produces (flex, grid, anchors, sizing) is the
[layout study](../feat-layout/); this spec defers to it and does not
restate it.

## Wrap and infer (loose selection)

On a loose selection, for **each** partition:

- **Wrap into a container** with the container-wrap discipline of
  [grouping](./grouping.md) (world position preserved, order preserved,
  one container per partition) — auto-layout is that same wrap, not a
  second mechanism.
- **Infer the layout** from the members' *parent-relative* rectangles:
  the flex **direction** (row vs column), the main-axis **gap**, and the
  main- and cross-axis **alignment** are guessed from their spacing and
  positions. The container **sizes to its content** and is inset at the
  members' union origin, so the result occupies the same space the
  selection did.
- **Members become flow children.** Each adopted member switches to
  relative (in-flow) positioning and is reordered along the guessed
  main axis; its rendered position does not move at the moment of
  creation.
- **Selection retargets** to the new container(s).

## Apply in place (existing container)

Applied to an **existing container** rather than a loose selection,
auto-layout turns that container's layout *on* — inferring direction,
gaps, and alignment from its current children — **without wrapping**.
This is a property change on one node: there is no partition and no
fan-out. It is the same inference over an already-existing frame.

## Root, scene, and refusal

The wrap obeys the scene's child constraint exactly as grouping does: a
partition targeting a single-child scene is refused rather than
violating the constraint ([selection-partition](./ux-surface/selection-partition.md),
PART-5).

## Contracts

- **ALY-1** Wrap-and-lay per partition: on a loose selection,
  auto-layout wraps **each** partition into one new flex container
  (the container-wrap of GRP plus a layout), adopting only that
  partition's members; one container per partition.
- **ALY-2** Layout inference: the new container's flex direction,
  main-axis gap, and alignment are inferred from the members'
  parent-relative arrangement; the container sizes to content and is
  inset at their union origin, so the layout occupies the selection's
  former space.
- **ALY-3** Members become flow children: adopted members switch to
  relative positioning and are ordered along the inferred main axis,
  with world position preserved at creation.
- **ALY-4** Apply in place: applied to an existing container,
  auto-layout enables that container's layout from its current children
  with no wrap and no partition fan-out — a single-node property change.
- **ALY-5** Selection retarget: after the wrap-and-lay, the selection is
  the new container(s).

Deferred, named: the flex/grid/anchor layout model and its sizing
semantics ([feat-layout](../feat-layout/)); the inference heuristic's
exact thresholds (owned by the layout study, not this command spec).
