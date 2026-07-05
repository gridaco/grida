---
title: Hierarchy Panel
description: The layers tree — reversed presentation order, external selection, drag math in document order, and virtualization at document scale.
tags:
  - internal
  - wg
  - editor
format: md
---

The hierarchy panel presents the active scene's node tree and edits
its structure. Its semantics are extracted from the production
editor's headless tree controller — a deliberately pure state machine
whose design this spec adopts: the tree logic (flattening, placement
resolution, keyboard) is UI-free and independently testable; the
panel is a thin view over it.

## Presentation

- **Order:** rows display front-on-top: visual top-to-bottom equals
  document order _reversed_. The controller owns this reversal; at
  the mutation boundary everything is document order
  ([document.md](https://github.com/gridaco/grida/blob/main/crates/grida_editor/docs/document.md)).
- **Root:** the scene root itself is hidden; its children are the
  top-level rows. Under isolation, the isolation root takes the
  scene's place.
- **Rows** show a type-derived icon (mask status takes precedence),
  the node name (falling back to its id), and always-visible
  indicators when hidden (`active=false`) or locked.
- **Expansion** is transient panel state — never persisted, never in
  history. Canvas selection reveals: ancestors of a newly selected
  node auto-expand (additively) and the row scrolls into view.

## Selection & hover

Selection is editor state; the tree never owns it. Click replaces;
the toggle modifier adds/removes; the range modifier selects the
visible-row range from the anchor. Hovering a row hovers the node on
canvas and vice versa; hover highlighting is suppressed during drag.

## Drag and drop

- Pointer-down arms a drag; it starts after a small movement
  threshold. If the grabbed row is selected, all selected rows drag;
  otherwise only the grabbed row (the multi-drag rule).
- The drop target resolves from pointer position: vertical position
  gives before/after/into (into only for containers, on the middle
  band); horizontal position gives desired depth, letting a drop
  "pop out" of a nested container at gutter boundaries.
- Forbidden drops — into the dragged nodes' own subtrees, into
  non-containers — resolve to the nearest legal placement or none.
- Commit emits one `move` mutation with post-removal document-order
  index (DOC-5): one history entry, undo restores prior structure
  and order exactly.
- Edge auto-scroll: nearing the scroll viewport's edges scrolls and
  re-resolves the target under the pointer. No auto-expand on hover.

## Operations

From rows and their [context menu](https://github.com/gridaco/grida/blob/main/crates/grida_editor/docs/context-menu.md): rename
(inline edit: double-click
or the rename key; confirm commits a name patch, cancel discards),
toggle active, toggle locked, delete, duplicate, group/ungroup,
flatten, reorder to front/back, copy. Every operation is a command or
mutation batch also reachable headlessly (ARCH-3). Locked nodes are
skipped by canvas picking but remain fully operable from the tree.

## Scale

The tree must remain interactive on documents at the engine's scale
target (≥100k nodes): row flattening is proportional to _visible_
(expanded) rows, and rendering is windowed to the viewport
(virtualization) — a collapsed 100k-node document is as cheap as a
100-row one.

## Contracts

- **HIER-1** Order round-trip: for any tree, row i (visual) maps to
  document index (n−1−i) among its siblings; a drop rendered between
  two rows commits the `move` that reproduces exactly that visual
  order.
- **HIER-2** Multi-drag rule: dragging a selected row moves the whole
  selection in one entry; dragging an unselected row moves only it,
  leaving selection unchanged.
- **HIER-3** Illegal drops are unreachable: no pointer sequence
  commits a move into a dragged node's own subtree or into a
  non-container.
- **HIER-4** Reveal: selecting a deeply nested node on canvas expands
  exactly its ancestor chain (collapsing nothing) and scrolls its row
  into the viewport.
- **HIER-5** Range selection operates on visible rows: with a
  collapsed container between anchor and target, hidden descendants
  are not selected.
- **HIER-6** Lock semantics: a locked node is not returned by canvas
  picking, while tree selection and tree-initiated operations on it
  succeed.
- **HIER-7** Windowing: with 100k nodes fully collapsed at the root,
  per-frame tree work is bounded by visible rows (measured, not
  eyeballed — budget in [harness.md](https://github.com/gridaco/grida/blob/main/crates/grida_editor/docs/harness.md)).
- **HIER-8** Rename lifecycle: confirm commits one name patch;
  cancel leaves name and history untouched.
