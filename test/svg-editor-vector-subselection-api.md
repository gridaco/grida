---
id: TC-SVGEDITOR-VECTOR-002
title: Programmatic vector sub-selection (set + read) in path-edit mode
module: svg-editor
area: vector
tags: [vector, content-edit, sub-selection, api, history, undo, observation]
status: untested
severity: medium
date: 2026-06-19
updated: 2026-06-19
automatable: false
covered_by:
  - packages/grida-svg-editor/__tests__/vector-subselection.test.ts
---

## Behavior

A host can programmatically drive the **vertex / segment / tangent
sub-selection** of a path open in vector content-edit, and observe it — the
write + read halves of [#790](https://github.com/gridaco/grida/issues/790).

- **Write, mid-session:** `editor.commands.set_vector_selection(input, mode?)`
  applies a sub-selection while a vector session is open. `mode` defaults to
  `"replace"` (the input becomes the whole sub-selection; omitted tracks
  cleared); `"add"` / `"toggle"` fold into the existing selection per track. It
  is **one undoable step**, exactly like a knob click.
- **Write, atomic entry:** `editor.enter_content_edit(id, { vertices, … })`
  opens the path AND applies the initial sub-selection as a single transition —
  no intermediate "open with nothing selected" frame, one undo step.
- **Read:** `editor.vector_subselection()` returns the current selection (or
  `null` outside a session); `editor.subscribe_vector_subselection(fn)` fires on
  every change and on enter/exit. The read channel is **off `state.version`**.
- **Strict refusal:** an out-of-range index/ref refuses the whole call (no-op,
  returns `false`) rather than selecting a phantom vertex.

The pure validation + mutation core and the editor-side delegation/read wiring
are unit-covered (`covered_by`). This TC covers what only manifests in a mounted
editor: that the HUD actually renders the programmatically-set anchors as
selected, that undo restores the prior sub-selection visibly, and that the
atomic-entry path shows no unselected flash.

## Steps

1. Mount the editor on a document containing
   `<path id="p" d="M0,0 L40,0 L40,40 L0,40 Z"/>` and select the path.
2. **Atomic entry.** Call
   `editor.enter_content_edit(p, { vertices: [1] })`.
   - Expected: the path enters content-edit with vertex **1** already drawn as
     selected (filled knob), no flash of an all-unselected overlay first.
   - Expected: `editor.vector_subselection()` returns
     `{ node_id: p, vertices: [1], segments: [], tangents: [] }`.
3. **Mid-session replace.** Call
   `editor.commands.set_vector_selection({ vertices: [0, 2] })`.
   - Expected: returns `true`; the HUD now shows vertices 0 and 2 selected, 1
     deselected; a `subscribe_vector_subselection` listener fired with the new
     value; `state.version` did **not** change as a result of this read channel.
4. **Add mode.** Call
   `editor.commands.set_vector_selection({ vertices: [3] }, "add")`.
   - Expected: vertices 0, 2, 3 selected (folded in, not replaced).
5. **Undo.** Press Cmd/Ctrl+Z once.
   - Expected: a single undo restores the step-3 sub-selection (vertices 0, 2),
     visible in the HUD — selection is history-coherent, like a click.
6. **Out-of-range refusal.** Call
   `editor.commands.set_vector_selection({ vertices: [99] })`.
   - Expected: returns `false`; the HUD selection is unchanged (no phantom
     knob, no exception).
7. **No session.** Exit content-edit (Escape), then call
   `editor.commands.set_vector_selection({ vertices: [0] })`.
   - Expected: returns `false` (no-op); `editor.vector_subselection()` is
     `null`; a subscriber fired with `null` on the Escape exit.

## Notes

- Paradigm: commands-only (the editor exposes a write command + a read view;
  there is no construction-time `initialState`). The document is the only
  declarative extern state — interaction state is reached by replaying commands.
- The session is surface-owned; the headless command reaches it through the
  `set_vector_subselect_driver` seam (symmetric to the content-edit driver), so
  with no surface attached the command is a clean no-op.
- Read channel parity: like `subscribe_pick` / surface-hover, it never bumps
  `state.version` (P4) — it changes at pointer rate during marquee/lasso.
