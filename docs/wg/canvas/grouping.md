---
title: Grouping
description: Wrap a selection into a new adopting parent — a group or a container — once per selection partition, with world position and order preserved; and ungroup as the inverse.
tags:
  - internal
  - wg
  - editor
format: md
---

Grouping wraps the selection into a **new adopting parent**: a _group_
(a logical, layout-free container) or a _container_ (a frame). It is
the canonical [per-partition](./ux-surface/selection-partition.md)
command — a cross-parent selection produces **one wrapper per
partition**, never a single wrapper that re-parents across the tree.
Ungroup is its inverse: dissolve one wrapper and promote its children.

The keys are in the [keybindings sheet](https://github.com/gridaco/grida/blob/main/crates/grida_editor/docs/keybindings.md):
`Mod+G` group, `Mod+Alt+G` group with container, `Mod+Shift+G`
ungroup.

## Wrap

`group` and `group with container` are the same operation over a
different target kind. Given the selection's
[partition](./ux-surface/selection-partition.md):

- **Per partition, one wrapper.** Each partition is wrapped into one
  new node of the chosen kind, adopting _that partition's_ members.
  Members from different parents never merge into one wrapper — the
  operation does not re-parent across partitions.
- **World position preserved.** The wrapper is placed at the **union
  bounds** of its partition's members, and each member is re-anchored
  into the wrapper's frame so its rendered position does not move.
- **Order preserved.** Members enter the wrapper in their prior
  **document sibling order**, and the wrapper takes the z-position of
  the partition's frontmost member — the group lands where the
  selection was, not on top of everything.
- **Selection retargets** to the new wrapper(s).

The two kinds differ only in what the wrapper _is_: a **group** carries
no layout and exists to move/organize its children as a unit; a
**container** is a frame with its own bounds, clip, and layout
capacity. Turning that container's layout on is [auto-layout](./auto-layout.md),
which is grouping-into-container plus a guessed flex layout.

## Ungroup

`ungroup` dissolves a single **group** (or boolean-operation node —
see [boolean](../feat-vector-network/boolean.md)) and promotes its
children:

- Children re-parent to the wrapper's **parent**, re-anchored so their
  world position is unchanged.
- They take the wrapper's **z-position**, in their existing order — the
  dissolved group's slot is filled by its former children.
- It is the exact inverse of a single-partition wrap: wrap then ungroup
  returns to the starting tree and geometry.

Ungroup operates on **one** wrapper (the selection is that wrapper), not
on a partition — dissolving is the removal of a parent, which has no
per-partition fan-out. A container is not dissolved by ungroup; its
frame is meaningful content, removed by deleting it and promoting its
children as a distinct act.

## Root, scene, and refusal

Scene/root-level members form the scene partition and wrap normally,
**unless** the scene constrains its children to a single child, in
which case the wrap is refused for that partition rather than violating
the constraint (see [selection-partition](./ux-surface/selection-partition.md),
PART-5).

## Contracts

- **GRP-1** Wrap per partition: `group` / `group with container` wraps
  **each** selection partition into one new parent of the chosen kind
  (group or container), adopting only that partition's members; a
  cross-parent selection yields one wrapper per partition and never
  re-parents across partitions.
- **GRP-2** World position preserved: each wrapped member's rendered
  position is unchanged — the wrapper is placed at its partition's
  union bounds and members are re-anchored into the wrapper's frame.
- **GRP-3** Order & depth preserved: members enter the wrapper in prior
  document sibling order, and the wrapper takes the z-position of its
  partition's frontmost member.
- **GRP-4** Ungroup inverse: `ungroup` dissolves one group (or boolean)
  node, re-parenting its children to the wrapper's parent at the
  wrapper's z-position with world position preserved; wrap-then-ungroup
  restores the starting tree and geometry exactly.
- **GRP-5** Selection retarget: after a wrap the selection is the new
  wrapper(s); after ungroup the selection is the promoted children.
- **GRP-6** Refusal: a wrap that would violate a scene's single-child
  constraint is refused for that partition (PART-5); the rest of the
  command still applies to the partitions that can wrap.

Deferred, named: mixed-kind selections for ungroup (only groups and
booleans dissolve; containers are content, removed by deletion), and
the auto-layout variant of the container wrap, owned by
[auto-layout](./auto-layout.md).
