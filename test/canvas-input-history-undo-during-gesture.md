---
id: TC-CANVAS-INPUT-004
title: Undo During Active Gesture Aborts Gesture and Undoes Previous Action
module: canvas
area: input
tags: [undo, history, gesture, drag, translate, scale, abort]
status: untested
severity: critical
date: 2026-04-07
updated: 2026-04-07
automatable: false
covered_by:
  - editor/grida-canvas/__tests__/headless/gesture-transaction.test.ts
---

## Behavior

When the user presses Cmd+Z while a drag gesture is active (mouse button still held), the gesture must be cleanly aborted before the undo proceeds. The node should snap back to its pre-gesture position, the gesture state should reset to idle, and then the previous history entry should be undone.

If this is not handled, the undo would execute against the history stack while the gesture transaction is still open. The gesture would then commit on pointer-up, producing a corrupt undo entry that captures a delta between the already-undone state and the drag endpoint — resulting in broken undo/redo behavior from that point forward.

The correct sequence on Cmd+Z during gesture:

1. Abort the gesture transaction (revert to pre-gesture document state)
2. Reset gesture state to idle (pointer event handlers should recognize the gesture is over)
3. Undo the previous history entry

After this, releasing the mouse button should be a no-op — the gesture was already aborted.

## Steps

1. Create two rectangles
2. Select rectangle A, rename it to "Renamed" (creating a history entry)
3. Click and begin dragging rectangle A (do NOT release the mouse)
4. While still holding the mouse, press Cmd+Z
5. Expected: rectangle A snaps back to its pre-drag position AND the rename is undone (name reverts to original)
6. Release the mouse
7. Expected: nothing happens — the gesture was already aborted
8. Verify: redo stack has entries for both the rename and (optionally) the aborted gesture state

### Variant: scale gesture

1. Create a rectangle
2. Change its width via the property panel (creating a history entry)
3. Begin resizing the rectangle via a corner handle (do NOT release)
4. Press Cmd+Z while resizing
5. Expected: rectangle snaps to pre-resize dimensions AND the width change is undone

### Variant: rotate gesture

Same pattern with rotation handle.

## Notes

This is a niche interaction — most users release the mouse before pressing Cmd+Z. But it occurs naturally when the user starts a drag, realizes it's wrong, and reflexively hits Cmd+Z instead of pressing Escape. The behavior must be clean to avoid corrupted history state that affects all subsequent undo/redo operations.

The implementation aborts the gesture at the `EditorDocumentStore.undo()` level: it checks `hasActiveGesture`, calls `abortGesture()` (which reverts state to the before-snapshot and discards the open transaction), then proceeds with normal undo.
