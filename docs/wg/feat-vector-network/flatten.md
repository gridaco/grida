---
title: Flatten
description: The destructive combine — convert a selection's shapes into one vector node per selection partition, baking geometry and discarding the originals.
tags:
  - internal
  - wg
  - canvas
  - vector
  - editor
format: md
---

Flatten bakes a selection's geometry into **vector networks** and
combines it — one new vector node per
[selection partition](../canvas/ux-surface/selection-partition.md),
destroying the originals. It is the destructive counterpart to
[boolean](./boolean.md): where a boolean keeps its operands alive and
recomputes the result, flatten resolves the geometry once, discards the
inputs, and hands back a plain editable vector. The command is
`Mod+E` ([keybindings](https://github.com/gridaco/grida/blob/main/crates/grida_editor/docs/keybindings.md)).

## The operation

Given the selection's partition, for **each** partition independently:

- **Convert** every flattenable member to a vector network (the same
  shape-to-network conversion the [pen mode](./vector-edit.md) uses on
  entry), positioned in world space.
- **Combine** the partition's networks into one via vector-network
  union — a single vector node whose geometry is the members'
  combined outline.
- **Carry the base style.** The new node inherits the **first member's**
  paint and node properties, so the result does not visually jump for
  the common single-style case; differing per-member paints are not
  preserved (flatten is a geometry operation, and one node holds one
  style).
- **Replace, in place.** The originals are deleted and the new vector
  is inserted under the partition's parent at the members' **lowest
  sibling index** (z-position preserved), its bounding box normalized
  and re-anchored so world position does not move.

The whole command is **one history entry**; undo restores every
partition's originals.

## Flattenable set

The flattenable kinds are the path-reducible primitives (rectangle,
ellipse, polygon, star, line), **vector** nodes, **text**, and
**boolean** nodes — the set the editor offers the command for. A group,
a container, or an image is not flattenable; such members are **left
unchanged** and remain selected alongside the new vector nodes — flatten
never silently drops or rasterizes them.

Two of these need a geometry backend to bake, and degrade the same way
the reference editor does when it is absent (its non-backend path
declines rather than approximating):

- **Text** needs a glyph-outline backend — the shaped outline of each
  glyph. Flatten **delegates** a text member to the same conversion
  [Create Outlines](./create-outlines.md) uses; without a font backend
  a text member is left unflattened, not approximated.
- **Boolean** bakes its _evaluated_ result (the merged path), which
  needs path-boolean evaluation. It is the destructive exit named in
  [boolean](./boolean.md); the boolean's own paint carries to the
  vector.

The primitives and vector nodes bake from geometry alone — a vector node
contributes its own network directly — so they flatten unconditionally.

## Not the mode-entry flatten

Entering [vector edit](./vector-edit.md) on a single primitive also
"flattens" it — shape builder → editable network — but that is a
**non-destructive content-edit entry** on one node (the primitive
becomes an editable vector so the pen can work), a different act with
its own lifecycle. This document specifies the **multi-select command**
that combines and discards. The two share the shape-to-network
conversion; they differ in destination (one editable node in a mode vs
one baked node in the tree) and in destructiveness.

## Contracts

- **FLAT-1** Per-partition combine: `flatten` combines the flattenable
  members of **each** selection partition into one new vector node (per
  partition) via vector-network union; the new node carries the first
  member's style. A cross-parent selection yields one vector per
  partition, never one across partitions.
- **FLAT-2** Flattenable set: the primitives (rectangle, ellipse,
  polygon, star, line) and vector nodes flatten unconditionally; text
  and boolean are flattenable but require a glyph-outline / path-boolean
  backend and are left unflattened when it is absent (never
  approximated). Non-flattenable members (group, container, image) are
  left unchanged and stay selected — the command neither drops nor
  rasterizes them.
- **FLAT-3** Destructive replace: the originals are deleted and the new
  vector is inserted under the partition's parent at the members' lowest
  sibling index, world position preserved, as **one** history entry;
  undo restores the originals.
- **FLAT-4** Boolean bake: flattening a boolean node produces a vector
  of its evaluated merged path carrying the boolean's paint — the
  destructive counterpart to keeping it live ([boolean](./boolean.md)).

Deferred, named: the **text** glyph-outline backend and the **boolean**
path-evaluation bake (FLAT-4) — flattenable in the set, but backend-gated
(as the reference editor's own non-backend path is); preserving differing
per-member styles across a flatten (one node, one style — not attempted);
the exact area-union-vs-compound-path semantics of the vector-network
combine is owned by the [vector network model](./vector-edit.md), not
restated here.
