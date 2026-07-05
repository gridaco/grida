---
title: Selection Partition
description: The per-parent partition of a multi-node selection — why a cross-parent selection presents as N overlay boxes, and which commands act per-partition versus on the whole-selection union.
tags:
  - internal
  - wg
  - editor
format: md
---

A multi-node selection is not always one thing. When the selected
nodes share a parent, they present and act as a single unit. When they
span parents, the editor **partitions** the selection by parent and
treats each partition as its own host: the surface draws N overlay
boxes rather than one, and a class of commands is applied once _per
partition_. This document defines the partition function, the
presentation it drives, and the rule that decides which commands
respect it — the shared substrate under
[grouping](../grouping.md), [auto-layout](../auto-layout.md),
[flatten](../../feat-vector-network/flatten.md), and
[boolean](../../feat-vector-network/boolean.md).

## The partition function

The partition key is each node's **direct parent**. Nodes at the
scene/root level share one partition — the **scene partition**.
Because selection is normalized (a parent and its own descendant are
never selected together — see [selection](./selection.md)), every
selected node is a leaf of the partition set, and the partition is a
clean cover: every member lands in exactly one partition.

Formally: `partition(selection) = group members by (parent(m) ?? scene)`.
Within a partition, members keep their **document sibling order** — the
order a structural command will preserve when it adopts them.

The partition is _derived_, never stored. It is recomputed from the
current selection and the current tree on every read, so it follows
re-parenting, deletion, and selection change without its own state.

## Presentation — one overlay per partition

The surface renders the partition directly:

- **A single node** → the single-node overlay (its own bounds, resize,
  rotate).
- **A multi-node selection under one parent** (one partition) → one
  group overlay over their union bounds.
- **A multi-node selection spanning M parents** (M partitions) → **M
  group overlays**, each over its own partition's union bounds, each
  carrying that partition's bounds-relative affordances: resize
  handles, the gap/distribution overlay, and a click/drag target
  scoped to _that partition's_ members.

The editor **never draws a single box spanning two partitions**. This
is the observable heart of the concept: a cross-parent selection has no
uniform bounding box, because there is no single parent frame such a
box could belong to.

**Relation to the union drag.** The plain _move_ gesture still
translates the whole selection together — translation is a
union command (below), owned by [translate](../translate.md). The
per-partition overlays own the _bounds-relative_ operations (resize,
gap, distribute) that only make sense within one frame. What
[selection](./selection.md) calls the "selection group overlay" — the
draggable multi-selection unit — is the **single-partition case** of
this presentation; the general case is N of them.

## The command taxonomy — per-partition vs union

The split between the two kinds of command is not a per-command flag;
it follows one rule:

> A command is applied **per partition if and only if it inserts a new
> adopting parent** — a node that becomes the parent of the selected
> members. Every other command acts on the whole-selection **union**,
> parent-blind.

**Per-partition (structural / containment).** Each produces **one new
node per partition**, adopting that partition's members in place with
world position preserved:

- [grouping](../grouping.md) — wrap into a Group or a Container.
- [auto-layout](../auto-layout.md) — wrap into a laid-out flex
  container.
- [flatten](../../feat-vector-network/flatten.md) — union the
  partition's shapes into one vector node.
- [boolean](../../feat-vector-network/boolean.md) — wrap the partition
  into one boolean-operation node.

**Union (spatial).** Each reads the whole selection as one set —
either its union bounds or a uniform delta — regardless of parent:

- [align](../align.md) & distribute — one shared world frame; each
  member still commits in its own parent's coordinates, but the frame
  is the union, not the partition.
- [translate](../translate.md) / [nudge](../nudge.md) — a uniform delta
  to every member.
- resize-nudge, scale — a uniform transform.

Why the split is principled: a new parent can only adopt the children
of _one_ existing parent context without re-parenting, and the
structural commands deliberately do **not** re-parent across partitions
(they preserve each member's place in the tree). So a structural
command must run once per partition. A spatial command moves nodes in
place and has no parent to respect, so it has nothing to partition.

## Root, scene, and refusal

- Scene/root-level nodes form the **scene partition** (their parent is
  the scene).
- A partition whose parent is the scene may still be wrapped — **unless**
  the scene constrains its children to a single child, in which case
  the wrap is refused for that partition rather than violating the
  constraint.
- A **single-node** selection needs no partition (one host): structural
  commands still run (one wrapper), the presentation is the single-node
  overlay, and align special-cases to the node's parent frame (its
  N = 1 rule).

## Contracts

- **PART-1** Partition function: a selection partitions by each
  member's direct parent; scene/root-level members share the scene
  partition; within a partition members keep document sibling order.
  The partition is derived from the current selection and tree on every
  read, never stored.
- **PART-2** Presentation mirror: a single node renders the single-node
  overlay; a multi-node selection renders exactly one group overlay per
  partition — never a single box spanning two partitions — and each
  overlay carries its partition's union bounds and bounds-relative
  affordances (resize, gap, distribute, click).
- **PART-3** Command taxonomy: a command applies per partition **iff**
  it inserts an adopting parent (grouping, auto-layout, flatten,
  boolean); every spatial command (align, distribute, translate, nudge,
  resize-nudge, scale) acts on the whole-selection union, parent-blind.
- **PART-4** Per-partition independence: a per-partition command
  produces one result node per partition, each adopting that
  partition's members with world position preserved; partitions never
  merge across parents into one result.
- **PART-5** Scene partition & refusal: scene/root-level members form
  the scene partition; a wrap targeting the scene is refused when the
  scene constrains its children to one.

Deferred, named: the move-gesture routing over multi-partition overlays
(the whole-selection translate, and which overlay's drag starts it) is
owned by [translate](../translate.md); this document owns the partition
and its presentation, not the move mechanics.
