---
id: TC-DESKTOP-WORKBENCH-002
title: ⌘⌫ defers to focused text fields (never trashes mid-edit)
module: desktop
area: workbench
tags: [file-tree, trash, keybinding, safety, focus]
status: untested
severity: high
date: 2026-06-02
updated: 2026-06-02
automatable: false
covered_by: []
---

## Behavior

The workbench's **⌘⌫** "move active file to Trash" shortcut is a global
window listener. But ⌘⌫ is also the standard macOS text-editing chord
**"delete to start of line."** So when the keystroke originates from an
editable surface — a text `<input>`, a `<textarea>` (the agent chat box,
the code editor's textarea), or any `contenteditable` element — the
workbench must **not** intercept it: it bails _before_ `preventDefault`,
leaving the focused field's native behaviour intact, and never triggers
the trash confirm.

This matters because the alternative is catastrophic: hitting ⌘⌫ while
editing text would otherwise pop a "move file to Trash" dialog (or, on a
regression that also dropped the confirm, silently delete the file the
user is editing). The guard is the line between "delete-to-line-start"
and "delete-my-file."

The other file-action shortcuts (⌥⌘R reveal, ⌥⌘C copy path) do not need
this guard — they don't collide with common text-editing chords — so
only the `"trash"` action is gated on the editable-target check.

## Steps

1. Open a workspace with a file open as the active tab.
2. Click into the **agent chat input** (a textarea) and type some text.
3. Place the caret mid-line and press **⌘⌫**.
   - Expected: the text from the caret to the start of the line is
     deleted (native behaviour). **No** trash confirm dialog appears.
4. Open a text file in the editor pane, focus its editor, type a line,
   and press **⌘⌫** mid-line.
   - Expected: same — line-start deletion in the editor, no trash dialog.
5. Now click a non-editable area (the file tree pane or the tab strip)
   so no input is focused, and press **⌘⌫**.
   - Expected: the trash confirm dialog for the active file appears
     (the normal flow from TC-DESKTOP-WORKBENCH-001 resumes).

## Notes

- Implemented by `isEditableTarget(e.target)` in
  `editor/scaffolds/desktop/workbench/workspace-workbench.tsx`, checked
  before `preventDefault` in the keydown handler.
- If a future editor uses a non-standard editable host (e.g. a custom
  element that isn't INPUT/TEXTAREA/contenteditable), extend
  `isEditableTarget` to cover it, or this guard will leak.
