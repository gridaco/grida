---
id: TC-CANVAS-INPUT-001
title: Guideline Event Handling During Canvas Input Modes
module: canvas
area: input
tags: [guidelines, content-edit-mode, insertion-tool, pointer-events, ruler]
status: verified
severity: medium
date: 2025-12-10
updated: 2025-12-10
automatable: false
covered_by: []
---

## Behavior

Guidelines should not be selectable or handle events when the editor is in eager canvas input mode — specifically when content edit mode (CEM) is active or when the insertion tool is selected.

The system maintains an `eager_canvas_input` state that is true when either condition is met. When true, guidelines must not respond to pointer events, cannot be dragged or focused, and should not trigger gesture creation. This applies to both existing guidelines (drag to reposition) and new guideline creation from the ruler overlay.

Users should be able to interact with guidelines normally when not in these input modes.

## Steps

1. Add a guideline to the canvas (drag from ruler)
2. Enter text edit mode (double-click a text node)
3. Try to drag the guideline — it should not respond
4. Exit text edit mode, select the insert tool
5. Try to drag the guideline — it should not respond
6. Deselect the insert tool (back to pointer)
7. Expected: guideline is now draggable again

## Notes

State is tracked via `eager_canvas_input` flag.
