---
id: TC-CANVAS-INPUT-003
title: Text Content Must Update Live During Editing
module: canvas
area: input
tags: [text-editing, wasm, content-edit-mode, live-update, regression]
status: verified
severity: critical
date: 2026-03-29
updated: 2026-03-29
automatable: false
covered_by: []
---

## Behavior

When editing text on the canvas, the visible content must update in real time as the user types — not only when the edit is committed or the user exits content edit mode. This applies across all text edit backends, but the regression specifically occurred with the WASM canvas native text edit backend, where typed characters were invisible during the editing session and only rendered upon commit/exit.

## Steps

1. Double-click a text node to enter text edit mode
2. Type characters
3. Expected: each character appears on canvas immediately as typed
4. Delete characters
5. Expected: canvas reflects the deletion immediately
6. Press Escape to commit
7. Expected: final text matches what was visible during editing (no content jump)

## Notes

Regression was introduced silently and missed — this TC exists as a reminder to verify live text rendering after any text edit backend changes.
