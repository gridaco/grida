---
id: TC-CANVAS-INPUT-003
title: Selection Changes Do Not Clear the Redo Stack
module: canvas
area: input
tags: [undo, redo, history, selection, clearsFuture]
status: untested
severity: medium
date: 2026-04-07
updated: 2026-04-07
automatable: true
covered_by:
  - editor/grida-canvas/reducers/__tests__/history.test.ts
  - editor/grida-canvas/__tests__/headless/undo-redo.test.ts
---

## Behavior

Selection and blur are navigation actions, not content mutations. When the user undoes a content change and then clicks to select a different node (or clicks on empty canvas to blur), the redo stack must survive. The user should be able to redo the content change afterward.

Without this, the common pattern of "undo → click elsewhere to inspect → redo" permanently loses the redo stack, which is destructive and surprising. Design tools like Figma preserve redo across selection changes.

Technically, `select` and `blur` dispatches record to the undo stack with `clearsFuture: false`. All other content-mutating actions (`node/change/*`, `delete`, `paste`, etc.) use the default `clearsFuture: true`.

## Steps

1. Create a rectangle, name it "Original"
2. Rename it to "Edited"
3. Cmd+Z — name reverts to "Original"
4. Verify: redo stack has 1 entry
5. Click on a different node (or click on empty canvas to blur)
6. Expected: redo stack still has 1 entry
7. Cmd+Shift+Z — name restores to "Edited"

### Edge cases

- Undo → select → select → redo — multiple selections between undo and redo should all preserve redo
- Undo → blur → redo — blur also preserves redo
- Undo → content edit (not select) → redo fails — content edits DO clear redo (correct)

## Notes

The `select()` and `blur()` methods on `EditorDocumentStore` dispatch with `{ clearsFuture: false }`. The adapter's time-bucketed recording and immediate recording both respect this flag when flushing to the history stack.
