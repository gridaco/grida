---
id: TC-CANVAS-INPUT-005
title: Drag Gesture Produces a Single Undo Step
module: canvas
area: input
tags: [undo, history, gesture, drag, translate, scale, rotate, resize]
status: untested
severity: critical
date: 2026-04-07
updated: 2026-04-07
automatable: false
covered_by:
  - editor/grida-canvas/__tests__/headless/gesture-transaction.test.ts
---

## Behavior

A complete drag gesture — from pointer-down through any number of pointer-move frames to pointer-up — must produce exactly one undo step, regardless of how many intermediate state changes occurred during the drag.

Without this, a drag that fires 60 pointer-move events per second would create 60 undo steps. The user would need to press Cmd+Z 60 times to undo a single drag, which is unusable.

The implementation uses `dispatch(…, { recording: "begin-gesture" })` on drag-start and `dispatch(…, { recording: "end-gesture" })` on drag-end. All mid-drag dispatches use `{ recording: "silent" }` — state updates for rendering but no individual history entries. On drag-end, the adapter compares the before-snapshot (captured at drag-start) with the current state and commits one delta.

This applies to all gesture types: translate, scale, rotate, sort, gap, padding, corner-radius, curve, variable-width-stop, and insert-and-resize.

## Steps

### Translate

1. Create a rectangle at position (0, 0)
2. Drag it to position (200, 150) — move the mouse slowly so multiple frames fire
3. Release the mouse
4. Verify: exactly 1 new undo entry
5. Cmd+Z — rectangle returns to (0, 0) in one step
6. Cmd+Shift+Z — rectangle returns to (200, 150) in one step

### Scale (resize)

1. Create a rectangle with width 100, height 100
2. Drag a corner resize handle to make it 300×200
3. Release
4. Verify: 1 new undo entry
5. Cmd+Z — dimensions revert to 100×100

### Rotate

1. Create a rectangle with rotation 0
2. Drag the rotation handle to ~45°
3. Release
4. Verify: 1 new undo entry
5. Cmd+Z — rotation reverts to 0

### Insert-and-resize (drawing a new node)

1. Select the rectangle insert tool
2. Click and drag on empty canvas to draw a rectangle
3. Release
4. Verify: 1 new undo entry for the entire insert+resize
5. Cmd+Z — the rectangle is removed

## Notes

Empty gestures (pointer-down + pointer-up without movement, or gestures that don't change any document state) should produce zero undo entries. This prevents phantom undo steps from accidental clicks.

The gesture transaction is opened by `surfaceDragStart()` and `surfaceStart*Gesture()` surface commands, and closed by `surfaceDragEnd()`. The mid-drag `surfaceDrag()` dispatches with `"silent"` recording.
