---
title: Arrange (z-order)
description: Stacking order as sibling order within a parent — the four arrange operations as pure reorderings of the sibling sequence, and the on-canvas sort gesture that drags a member to a new slot.
tags:
  - internal
  - wg
  - canvas
  - scene-graph
format: md
---

Arrange changes _which node paints over which_. It is not a geometry
edit and not a structure edit: it never moves a node in space and never
changes its parent. It only permutes the order of children **within a
single parent**. The whole feature is one model — paint order is sibling
order — plus four named reorderings over that sequence and one on-canvas
gesture that authors it directly.

## The ordering model

Every parent holds its children as an **ordered sequence**. That
sequence _is_ the paint order among siblings: earlier in the sequence
paints first (further back), later paints last (nearer the front). A
node's stacking position is therefore **relative to its siblings**, not
a global depth — there is no scene-wide z index to set.

The invariant that follows: **z is a within-parent total order.** Two
nodes have a defined front/back relationship only when they share a
parent; the relative depth of nodes under different parents is decided
entirely by their ancestors' relative order, never by the nodes
themselves. A child can never paint outside its parent's slot — nesting
composes the per-parent orders into the rendered stack, and arrange
operates on exactly one of those orders at a time.

Consequences of the model, not extra rules:

- Reordering a node reorders **only** its own sibling sequence; every
  other parent's sequence is untouched.
- Reordering never crosses a parent boundary. Bringing a deeply-nested
  node "to front" brings it to the front _of its siblings_ — it does not
  leap past its parent's peers. Making a node paint over content in
  another branch is a **structural** move (re-parent), owned by
  [translate](./translate.md) and [grouping](./grouping.md), not arrange.
- The scene root is itself a parent; top-level nodes are its children and
  arrange among themselves like any other sibling set.

## The four operations

Each operation is a **pure reordering** of one node's sibling sequence —
same members, same parent, same geometry, new order. Over a sequence
with the target at index `i` in a sequence of length `n`:

- **bring-to-front** — move the target to the **last** position (`n−1`);
  it paints over all its siblings.
- **send-to-back** — move the target to the **first** position (`0`); it
  paints under all its siblings.
- **bring-forward** — move the target **one step later** (`i → i+1`),
  swapping past the single sibling currently in front of it.
- **send-backward** — move the target **one step earlier** (`i → i−1`),
  swapping past the single sibling currently behind it.

The two absolute operations (front/back) are idempotent at the
extremes: a node already frontmost stays put under bring-to-front. The
two relative operations (forward/backward) **saturate** at the ends: a
frontmost node under bring-forward does not move and does not error.

A fifth form exists but is not a user-facing command: **move-to-index**,
placing the target at an explicit slot in its sibling sequence. It is the
primitive the [sort gesture](#the-sort-gesture) commits; the four named
operations are its relative and absolute specializations.

### Multi-selection

Arrange applies the **same relative operation to each selected node
independently**, each within its own sibling sequence:

- A multi-selection spanning **different parents** is legal. Each member
  reorders inside its own parent; no member crosses into another's
  parent, and the selection is never partitioned into a single wrapper
  (contrast the structural commands, which fan out
  [per-partition](./ux-surface/selection-partition.md)). Arrange is a
  per-node command, not a per-partition one.
- For members that **share a parent**, applying the operation
  member-by-member preserves their **relative order among themselves**
  under the absolute operations: send-to-back on a co-parented set drops
  them to the back _as a block_, keeping their internal order, rather
  than inverting it. The relative operations (forward/backward) advance
  each member one slot in sequence order, so a contiguous block shifts by
  one and a non-contiguous selection closes toward the moved direction.

Order of application within a shared parent is defined to make the block
behavior above hold; the contract fixes the observable outcome, not the
iteration.

## The sort gesture

The same reordering is authorable **directly on the canvas** by dragging
a member to a new stacking slot — the on-canvas counterpart to the four
commands. It is a single exclusive gesture (see [surface](./surface.md)),
distinct from [translate](./translate.md): translate moves a node in
space and may re-parent it; the sort gesture only permutes sibling order
and moves nothing spatially.

- **Affordance.** Each member of the current selection carries a small
  drag handle at its center; the handle set is the on-canvas control for
  reordering the selection, and only appears while a selection is
  present. Pressing a member's handle begins a sort of _that_ member.
- **Live preview.** As the pointer moves, the gesture resolves a
  **prospective slot** — the index in the sibling sequence the member
  would occupy on release — and previews the sequence reordered to that
  slot continuously. The preview shows the committed result at every
  frame; there is no separate "drop indicator" state that disagrees with
  what a release would produce.
- **Single commit.** Release commits the member to its previewed slot as
  the move-to-index primitive. Nothing partial is written mid-drag and
  the abort restores the pre-gesture order exactly.
- **Within-parent only.** The gesture reorders inside the member's own
  parent's sequence; it does not re-parent. Dragging that would change a
  node's parent is translate's job, not sort's — the two gestures are
  disjoint by design.

History framing — that the preview writes nothing and the release is one
entry — is the general gesture-and-commit discipline owned by
[history](../feat-history/); arrange commits as a single entry like any
other gesture and this document does not restate the framing.

## Deferrals

- **Command dispatch & keybindings** — which key or menu item raises each
  arrange operation is owned by the [input](./input.md) layer and the
  binding sheet; this document defines the operations, not their
  triggers.
- **Selection** — what is selected, and how the selection is resolved
  from a pointer, is owned by the [selection](./ux-surface/) docs.
  Arrange consumes the selection; it does not define it.
- **Re-parenting / grouping** — any order change that implies a parent
  change (dragging a node "in front of" content in another branch,
  wrapping, ungrouping's slot inheritance) is
  [grouping](./grouping.md) and [translate](./translate.md) territory. A
  group inherits the z-position of its frontmost member (grouping GRP-3)
  and ungroup fills the dissolved group's slot with its children
  (GRP-4); those are structural contracts, referenced not restated here.
- **History framing** — the write-nothing-until-commit, one-entry rule is
  [history](../feat-history/)'s.

## Contracts

- **ARR-1** Sibling-relative order: a node's stacking position is its
  index within its parent's child sequence; earlier paints further back,
  later paints nearer the front. There is no global z. Two nodes have a
  defined front/back relation iff they share a parent.
- **ARR-2** Within-parent closure: every arrange operation permutes only
  the target's own sibling sequence; no other parent's sequence changes,
  no node crosses a parent boundary, and no node's parent or geometry
  changes.
- **ARR-3** bring-to-front / send-to-back: the target moves to the last /
  first position of its sibling sequence; already-extremal targets are
  unchanged (idempotent), and no geometry is touched.
- **ARR-4** bring-forward / send-backward: the target moves exactly one
  slot later / earlier in its sibling sequence, and saturates (no-op, no
  error) at the front / back end.
- **ARR-5** Multi-selection is per-node: each selected node reorders
  within its own parent independently; a cross-parent selection is legal
  and is never merged into one wrapper.
- **ARR-6** Co-parented block: applying an absolute operation to several
  members of the same parent moves them to the extreme **as a block**,
  preserving their prior relative order among themselves.
- **ARR-7** Sort preview fidelity: during the sort gesture the previewed
  sequence at every frame equals the sequence that a release at that
  instant would commit; the resolved slot is a valid index in the
  member's sibling sequence.
- **ARR-8** Sort commit & abort: release commits the member to its
  previewed slot within its own parent (a move-to-index) and re-parents
  nothing; abort restores the pre-gesture order exactly, and the commit
  is one history entry.
