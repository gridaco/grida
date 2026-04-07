---
id: TC-CANVAS-INPUT-002
title: Editor History System Takes Precedence in Content Edit Mode
module: canvas
area: input
tags:
  [undo, redo, history, content-edit-mode, cmd-z, contenteditable, text-editing]
status: verified
severity: critical
date: 2025-12-22
updated: 2025-12-22
automatable: false
covered_by: []
---

## Behavior

When content edit mode is active and the user is typing in a focused contentEditable element (e.g. the text editor), the browser's native undo/redo would normally intercept Cmd+Z / Cmd+Shift+Z before the editor's history system can respond. This traps users in the editing state — they cannot undo their way out of content edit mode, and pressing Escape commits changes that destroy forward history.

To prevent this, Cmd+Z and Cmd+Shift+Z must execute the editor's document-level undo/redo system even when a canvas-related input is focused. This allows navigating backward through the history stack to exit content edit mode naturally without committing changes.

This behavior applies specifically to input elements rendered on behalf of canvas content editing, but should NOT override browser-native undo/redo for regular form inputs or UI widget inputs.

## Steps

1. Double-click a text node to enter text edit mode
2. Type some text
3. Press Cmd+Z repeatedly
4. Expected: editor-level undo fires, eventually exiting content edit mode
5. The forward history stack should be preserved (Cmd+Shift+Z can redo)
6. Verify that Cmd+Z in a regular UI input (e.g. search field) still uses browser-native undo

## Notes

Without this fix, users become trapped in CEM and the forward history stack is permanently lost on Escape.
