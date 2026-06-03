---
id: TC-SVGEDITOR-TEXT-001
title: Empty text is deleted on content-edit exit
module: svg-editor
area: text
tags: [text, content-edit, history, undo]
status: tested
severity: medium
date: 2026-06-03
updated: 2026-06-03
automatable: false
covered_by:
  - packages/grida-svg-editor/__tests__/text-insert.test.ts
---

## Behavior

A `<text>` element with no content renders nothing and is effectively
impossible to select on the canvas (no painted geometry to hit). It is a
dead document state — invisible, unselectable, and noise in the file. So
the editor treats it as a deletion: **on exit from text content-editing, a
text element whose content is empty is removed.** "Empty" means zero-length
content — a typed space is authored content and is kept.

The rule is unconditional (it fires however the node became empty), but the
undo treatment depends on whether the node existed before the gesture:

- **Freshly placed** (text tool → click → no typing → exit): creation and
  the empty exit are one abandoned gesture. The node is gone and there is
  **no committed history entry** — undo does not resurrect an empty node.
- **Pre-existing, cleared empty** (double-click an existing text → delete
  all chars → exit): a deletion of that element, as **one undoable step**.
  Undo restores the element with its original content intact.

Committing with content is one undo step (create + text together); redo
restores the node _with_ its text.

Design: `docs/wg/feat-svg-editor/text-tool.md`. The core history bracketing
is unit-tested (`covered_by`); the full pointer→type→exit flow needs real
interaction and is verified here.

## Steps

Open the SVG editor demo at `http://localhost:3000/svg/`.

1. **Fresh, empty → vanishes.** Press `T` (or pick the Text tool), click an
   empty area. A caret appears. Type nothing. Press `Enter` (or click away).
   - Expected: no `<text>` remains, no 0×0 selection chrome lingers.
   - Press `Cmd/Ctrl+Z`. Expected: nothing is resurrected (the placement
     left no history entry).

2. **Fresh, with content → one undo / redo keeps text.** Press `T`, click,
   type `hello`, press `Enter`.
   - Expected: the text shows and is selected.
   - `Cmd/Ctrl+Z` once. Expected: the whole text node is gone (not just the
     characters).
   - `Cmd/Ctrl+Shift+Z` (redo). Expected: the text node returns showing
     `hello` (not an empty node).

3. **Existing, cleared → removed and restorable.** With a text node that has
   content, double-click it to edit, select all (`Cmd/Ctrl+A`), delete,
   press `Enter`.
   - Expected: the node is removed.
   - `Cmd/Ctrl+Z`. Expected: the node returns with its original content.

4. **Whitespace is content.** Press `T`, click, type a single space, press
   `Enter`.
   - Expected: the node is kept (a space is authored content, not empty).

## Notes

Implemented via `insert_text_preview` (core history bracket) +
`finalize_text_exit` (DOM shell) in `packages/grida-svg-editor`. The
"redo keeps text" assertion (step 2) guards against a regression to a plain
`insert_preview`, which would redo to an empty node since text is not an
attribute.
