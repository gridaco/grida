---
id: TC-SVGEDITOR-VECTOR-003
title: Delete / Backspace in path edit mode removes sub-selected vertices, not the element
module: svg-editor
area: vector
tags: [vector, content-edit, delete, hotkeys, policy-class, history, undo]
status: untested
severity: high
date: 2026-06-22
updated: 2026-06-22
automatable: false
covered_by:
  - packages/grida-svg-editor/__tests__/vector-edit-delete.test.ts
---

## Behavior

While in path edit mode (`state.mode === "edit-content"` / vector content-edit),
pressing <kbd>Delete</kbd> or <kbd>Backspace</kbd> removes the **sub-selected
geometry** (vertices / segments / tangents) from the path under edit — it does
**not** detach the whole element (gridaco/grida#880).

`Delete` / `Backspace` are bound to a two-row chain (`keymap/defaults.ts`):
`vector.delete-vertex` runs first and consumes the key in `edit-content` mode;
outside that mode it falls through to `selection.remove`, which deletes the
selected element(s) in `select` mode. `selection.remove` is now guarded on
`select` mode (the one structural handler that previously lacked the guard —
the root cause of the over-delete).

The deletion honors the policy-class `delete-vertex` verdict: for a vertex-chain
source (`<line>` / `<polyline>` / `<polygon>`) the policy is `restrict` — the
gesture is **refused** when removing the selected vertices would drop the chain
below its structural minimum (polygon ≥ 3, polyline ≥ 2, line keeps 2). For a
`<path>` the policy is `bake` — always applied (the path may collapse to empty).
A deletion is a single undo step that restores both the geometry and the
sub-selection that was deleted; the element survives and stays in edit mode.

The policy gate and the geometry are unit-covered (`covered_by`). This TC covers
what only manifests through real pointer + keyboard interaction in a mounted
editor: that the overlay re-renders the smaller shape, that the element is not
detached, and that an empty sub-selection / policy refusal is a clean no-op.

## Steps

1. Mount the editor on a document containing
   `<path id="p" d="M0,0 L40,0 L40,40 L0,40 Z" fill="red"/>`.
2. Double-click the path (or select it and press <kbd>Enter</kbd>) to enter
   path edit mode. Click a single interior vertex to sub-select it.
3. Press <kbd>Delete</kbd>.
   - Expected: only the sub-selected vertex is removed; the overlay and the
     rendered shape update to the smaller path; the element is still the same
     `<path id="p">` (NOT detached from the document), still in edit mode, and
     the sub-selection is now empty.
4. Press <kbd>Cmd/Ctrl+Z</kbd> once.
   - Expected: a single undo restores the prior geometry **and** re-selects the
     vertex that was deleted.
5. Repeat step 3 with <kbd>Backspace</kbd> — identical behavior to
   <kbd>Delete</kbd>.
6. With nothing sub-selected (click empty space inside edit mode to clear the
   sub-selection), press <kbd>Delete</kbd>.
   - Expected: no-op — the element is NOT deleted and the file is unchanged.
7. **Policy — vertex-chain restrict.** Mount a triangle
   `<polygon points="0,0 40,0 20,40"/>`, enter edit mode, sub-select one vertex,
   press <kbd>Delete</kbd>.
   - Expected: refused — the polygon keeps all 3 vertices (a triangle cannot
     drop below 3). Deleting a vertex from a 4+-point polygon is allowed and
     re-types the opened shape to `<path>` per the promote rule.
8. **Select mode unchanged.** Exit to `select` mode (Escape), select the whole
   element, press <kbd>Delete</kbd>.
   - Expected: the element is removed from the document (the original
     element-delete behavior, one undo step).

## Notes

- Deletion mirrors the main canvas editor's path-edit delete
  (`editor/grida-canvas/reducers/document.reducer.ts`
  `__self_delete_vector_network_selection`): tangents → segments → vertices, then
  clear the sub-selection. `vn.deleteVertex` does **not** reconnect a deleted
  interior vertex's neighbours — the incident segments are dropped and an
  orphaned neighbour simply stops rendering. Reconnection would be a separate
  enhancement applied to both editors.
- The write routes through the same `vector_apply` / `vector_revert` commit path
  as every other vector edit, so a vertex-chain delete that escapes the native
  form (e.g. opening a polygon) re-types to `<path>` and undoes byte-for-byte —
  see TC-SVGEDITOR-VECTOR-001.
