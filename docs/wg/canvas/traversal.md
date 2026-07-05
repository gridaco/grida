---
title: Traversal
description: Keyboard selection traversal — Enter/Shift+Enter walk down and up the tree, Tab/Shift+Tab walk across siblings, and traversal keeps its result visible.
tags:
  - internal
  - wg
  - editor
format: md
---

Traversal is the keyboard's answer to the pointer's
[targeting](./ux-surface/targeting.md): four commands that move the selection
through the tree without touching the mouse — down into children, up
to parents, and across siblings. They are primitive commands
(registry entries like any other); this document owns their
semantics, and [routing](https://github.com/gridaco/grida/blob/main/crates/grida_editor/docs/routing.md) owns how the same keys resolve
elsewhere (Enter inside a text session, Tab across widgets).

## Down — Enter

Enter binds the alternative chain *enter-content-edit →
select-children*:

1. **Single editable leaf selected** (text, vector): enter its
   content mode per the [edit-mode](./edit-mode.md) dispatch table —
   the keyboard twin of the double-click descend-then-enter idiom
   (TGT-4). A leaf has no children, so the two meanings never compete
   on real trees; the chain order merely makes the tie impossible by
   construction.
2. **Otherwise**: replace the selection with the union of the
   selected nodes' children. A childless, non-editable selection
   makes Enter a no-op — it never falls through to the host.

Repeated Enter walks the tree level by level: container → its
children → their children — the keyboard equivalent of repeated
double-clicks, except it fans out (all children) rather than
following a pointer path.

## Up — Shift+Enter

Replace the selection with the union of the selected nodes'
parents. Top-level nodes (children of the scene root) are already at
the surface: they contribute themselves, and when the whole selection
is top-level the command is a no-op — the scene root is never
selected by traversal. Shift+Enter is the exact inverse walk of
Enter's descent, and it also serves as the exit ramp from a deep
click: dive with the deep modifier, then Shift+Enter back out level
by level.

## Across — Tab / Shift+Tab

Tab replaces the selection with the **next sibling** of the traversal
anchor — the most recently selected node — in document order;
Shift+Tab the previous. The walk wraps at both ends, skips inactive
nodes, and includes locked ones (traversal is a tree operation, not a
canvas pick — HIER-6's split applies). A multi-node selection
collapses to the anchor's neighbor: Tab is deliberately a
single-selection instrument.

With an empty selection, Tab selects the scene's first top-level
node — an entry point, so the keyboard can reach the tree from
nothing.

## Reveal — the camera follows

Traversal must never select off-screen invisibly. When a traversal
command's result is not fully inside the viewport, the camera pans
the minimal distance to reveal it (no zoom change). This mirrors the
hierarchy panel's reveal rule (HIER-4) on the canvas side: keyboard
navigation always shows you what it just did.

## Contracts

- **TRAV-1** Enter on a container selection selects exactly the
  union of children, replacing the selection; on a single editable
  leaf it enters content-edit; on a childless non-editable selection
  it is a no-op.
- **TRAV-2** Shift+Enter selects the union of parents; on an
  all-top-level selection it changes nothing; the scene root is
  never selected.
- **TRAV-3** Enter then Shift+Enter from a single container round-
  trips to the original selection.
- **TRAV-4** Tab cycles siblings in document order with wrap-around;
  N siblings need exactly N Tabs to return; Shift+Tab reverses the
  cycle; inactive siblings are skipped, locked ones are not.
- **TRAV-5** Traversal is view-safe: after any traversal command,
  the selection's bounds intersect the viewport (the camera panned
  if needed), and no document mutation or history entry occurred.
