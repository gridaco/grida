---
title: Translate Models
description: The two structural behaviors of the move gesture — clone-on-translate (duplicate under a held modifier, live-toggleable) and hierarchy change (re-parenting mid-drag with the drop-target overlay).
tags:
  - internal
  - wg
  - editor
format: md
---

Translate is more than a position patch. Two behaviors turn the move
gesture into a *structural* instrument: the clone modifier makes it
duplicate, and hierarchy change makes it re-parent. Both run inside
the one exclusive gesture ([surface](./surface.md)), both are
reconfigured **live** by their modifiers (golden input spec), and
both commit as part of the translate's single history entry. The
gesture-time alignment of the previewed positions is
[snap](./snap.md); this document owns the structure.

## Clone on translate

Holding the clone modifier (Alt) during a translate turns the move
into a duplicate-and-move. The rule that makes it feel right: **the
clone moves; the origin rests.**

State machine, driven by the modifier's live state:

- **Modifier ON** (at gesture start or mid-drag): the dragged
  originals revert to their gesture-start positions; a **deep clone**
  of each is minted (whole subtree, fresh ids) and inserted as its
  original's **immediate next sibling** — the clone paints directly
  above its origin, and a multi-member selection's clones interleave
  with their origins in document order. The selection retargets to
  the clones, which adopt the gesture's current delta. The flip takes
  effect on the modifier edge itself — no pointer movement required.
- **Modifier OFF** (mid-drag): the clones vanish; the originals
  resume following the pointer; the selection returns to them.
  Toggling ON again mints *fresh* clones — abandoned clones are never
  committed and never leak ids.
- **Snapping retargets with the selection**: while cloning, the
  clones are the snap agents and the resting originals become
  ordinary snap anchors — a clone can snap against its own origin,
  which is precisely the step-and-repeat use case.

Commit and history:

- One entry: insert + move + selection change undo together; a single
  undo removes the clones entirely and restores the original
  selection.
- Cancel (Escape) restores the document exactly — no clones, origins
  at rest, no entry.
- A cloned commit with **zero net movement** is a duplicate-in-place,
  identical in outcome to the duplicate command.
- **Repeat offset**: a cloned commit arms the duplicate command —
  the next duplicate repeats the *measured* delta between origin and
  clone, so drag-clone followed by repeated duplicates produces a
  step-and-repeat series. Measured, not stored: however the clone
  was moved after the flip (drag, nudge, inspector), the repeat uses
  the resulting offset.

## Hierarchy change on translate

While translating, the document tree follows the pointer: dragging a
node over a container moves it *into* that container, dragging it out
moves it *out*. This is the default behavior of translate, not a
special mode.

**Drop-target resolution**, re-evaluated every gesture frame:

- The candidate is the **top-most valid hit under the pointer** — in
  z-order — among nodes that can adopt children: the scene root,
  containers, and trays. Groups and boolean nodes are not adoption
  targets (they are derived parents, not spatial ones).
- The dragged nodes, any live clones, and all their descendants are
  excluded — a subtree can never be dropped into itself.
- A container whose child frame is not a pure translation (rotated or
  scaled) is not a v1 adoption target — re-deriving a local position
  under such a frame is deferred with local-frame resize; the chain
  resolves past it.
- **Closed parents hold their children**: a member whose current
  parent is a group or boolean node does not re-parent; in a mixed
  selection the free members re-parent and the closed ones stay —
  a group is dissolved deliberately (ungroup), never by dragging its
  children away.
- A tray may only enter the scene root or another tray.

**Re-parenting is live**: the move happens during the drag, the
moment the resolved parent differs from the current one — there is
no dwell delay (an explicit decision: the overlay makes the target
legible, and Escape aborts everything, so hesitation costs nothing).
Across the parent change:

- **World position is preserved** — the node's local position is
  re-derived against the new parent's frame each frame, so the
  content never jumps.
- The node enters the new parent at the **top of its z-order** (last
  in document order).

**The drop-target overlay**: while the pointer's resolved target
would leave a dragged node re-parented — relative to its
*gesture-start* parent, since the structural move itself is live —
that container renders a highlight outline on the HUD — the one
piece of chrome this behavior owns. It marks the *prospective*
parent, updates as the pointer crosses container boundaries, and
disappears at commit or when the target equals the gesture-start
parent again; the scene root, having no bounds to outline, draws
none. (A slot-marker variant for insertion position inside
auto-layout containers is the named next refinement; the outline
form is the contract today.)

**History**: the re-parents ride the translate's single entry — one
undo restores prior parents, order, and positions together with the
position.

## Contracts

- **TRL-1** Clone edges are live: pressing the clone modifier
  mid-drag reverts the originals and moves clones on that very
  event; releasing it removes them and resumes the originals — both
  without pointer movement.
- **TRL-2** Clone placement: each clone is a deep copy with fresh
  ids, inserted as its origin's immediate next sibling; a
  multi-member clone set interleaves with origins in document order.
- **TRL-3** Cloned commit is one entry: undo removes the clones and
  restores the pre-gesture selection; cancel restores the document
  byte-exact with no entry.
- **TRL-4** Zero-movement cloned commit ≡ duplicate; a cloned commit
  arms repeat-offset duplication with the measured delta.
- **TRL-5** ON→OFF→ON mints fresh clones; no abandoned clone or its
  ids are observable after commit.
- **TRL-6** Re-parent preserves world position: across any parent
  change during translate, the dragged node's world rect is
  continuous (equal before and after the structural move, modulo the
  gesture's own delta).
- **TRL-7** Exclusion: no pointer path re-parents a node into its
  own subtree, into a group/boolean, or a tray into a non-tray
  non-root parent; children of groups/booleans never re-parent by
  translate.
- **TRL-8** The overlay tells the truth: whenever a commit at this
  instant would leave a member under a parent other than its
  gesture-start parent, the prospective container is highlighted;
  whenever it would not — or the target is the scene root — no drop
  highlight renders.
- **TRL-9** Translate with re-parenting is one history entry; undo
  restores structure and geometry in one step.
