---
id: TC-SVGEDITOR-RESIZE-001
title: HUD resize of text is undone by Cmd+Z and rolled back by Escape
module: svg-editor
area: resize
tags: [resize, hud, text, history, undo]
status: untested
severity: high
date: 2026-06-12
updated: 2026-06-12
automatable: true
covered_by:
  - packages/grida-svg-editor/__tests__/resize-revert-restore.test.ts
  - packages/grida-svg-editor/__tests__/resize-snapshot-coverage.test.ts
---

## Behavior

A committed HUD resize is one undoable history step for **every**
resizable tag, including `<text>`. Undo must restore the exact
pre-gesture attribute state — byte-exact strings, and **absence**: if
the element had no `font-size` attribute before the gesture, undo
removes the one the gesture wrote rather than leaving a fabricated
`font-size="16"` behind.

The invariant under test is the revert contract, not the gesture: the
resize history delta reverts by restoring a raw attribute snapshot
captured at gesture open (`resize_pipeline.intent.restore`), never by
re-applying the gesture at identity scale. Per-tag handlers are
allowed to _refuse_ gesture shapes (text refuses edge drags; a corner
drag scales `x`/`y`/`font-size` uniformly), and a refusal arm must not
be able to swallow a revert. The historical bug: revert ran the text
handler with `sx = sy = 1`, which the handler classified as a refused
non-corner gesture — so Cmd+Z popped the history entry while the
document silently kept the resized values. The same revert backs
Escape-cancel and the `resize_to`/`resize_by` RPC path, and also
restores `transform` (commit-phase rotate-pivot renormalization), so
all of those are exercised here.

## Steps

Open the SVG editor demo at `http://localhost:3000/svg/` (or
`/svg/examples/default`). Insert or pick a `<text>` element.

1. **Corner resize → undo.** Select the text, drag the SE corner
   handle outward until the text visibly grows, release.
   - Expected: text stays at the new size; one history entry exists.
   - Press `Cmd/Ctrl+Z`. Expected: the text returns to its exact
     pre-drag position and size (inspect `x`, `y`, `font-size` in the
     inspector / serialized SVG).
   - Press `Cmd/Ctrl+Shift+Z` (redo). Expected: the resized state
     returns.

2. **Escape-cancel.** Select the text, start dragging the SE corner
   handle, and press `Escape` while the pointer is still down.
   - Expected: the text snaps back to its pre-drag size immediately;
     no history entry is left (Cmd+Z does not change the text).

3. **Absence restored.** Use a text element with no `font-size`
   attribute (size inherited from CSS). Corner-resize it, then undo.
   - Expected: the serialized element has **no** `font-size`
     attribute after undo — its rendered size returns to the
     inherited value.

4. **Rotated element.** Give a `<rect>` an explicit-pivot rotation
   (`transform="rotate(30 60 35)"`), corner-resize it, undo.
   - Expected: the `transform` string is restored byte-exact and the
     rect renders exactly as before the drag.

## Notes

Etiology and fix: revert previously routed through
`intent.apply(..., 1, 1, ...)` in two places —
`resize_pipeline.revert` (HUD gesture) and the `commit_resize` revert
in `core/editor.ts` (`resize_to` / `resize_by`) — both now restore the
raw snapshot. The unit suite in `covered_by` drives the orchestrator
with the same wiring as the DOM adapter; this TC verifies the real
pointer → HUD → keymap chain on top.
