---
id: TC-DESKTOP-WORKBENCH-001
title: Move a workspace file or folder to Trash (context menu + ⌘⌫), with confirm
module: desktop
area: workbench
tags: [file-tree, trash, keybinding, context-menu, destructive]
status: untested
severity: high
date: 2026-06-02
updated: 2026-06-02
automatable: false
covered_by: []
---

## Behavior

A workspace entry can be deleted from the workbench's file tree pane.
**File rows and folder rows** both have the same right-click menu —
Reveal in Finder, Copy path, Copy relative path, and **Move to Trash**.
A file can also be trashed with **⌘⌫ (Ctrl+Delete)** while it is the
active tab; the keyboard shortcut is file-only because folders are never
the active tab. The file/tab right-click menu on the editor tab strip
carries the same actions.

Deletion always goes through the OS Trash via `shell.trashItem`, never a
permanent `fs.rm`, so an accidental delete is recoverable from Finder's
Trash. Trashing a folder takes its whole subtree (also recoverable).
Every entry point first shows a **native confirmation dialog** —
"Move _"name"_ to the Trash?" for a file, "Move _"name"_ and its
contents to the Trash?" for a folder, with **Move to Trash** / **Cancel**
(default Cancel). The destructive action is always one deliberate
confirmation away.

The delete is a host capability, not an agent-sidecar one: the renderer
sends only `{workspaceId, relPath}` to the desktop main process, which
re-validates that the path resolves **inside** the opened workspace root
(rejecting `..` escapes, symlinks that leave the workspace, and the root
itself) before trashing. You can only ever trash an entry inside a
workspace you have opened.

After a successful trash, affected tabs close without being added to the
"reopen closed tab" stack — ⌘⇧T must never resurrect a deleted entry. A
trashed **file** closes its own tab; a trashed **folder** closes every
open tab under it. The file tree then refreshes so the row disappears.

## Steps

1. Open a workspace folder in Grida Desktop containing at least one file
   (e.g. `notes.txt`) and one subfolder with a file inside it
   (e.g. `src/app.ts`).
2. **Right-click the file row.**
   - Expected: the menu shows a red **Move to Trash** item with a `⌘⌫`
     hint, below a separator under the Reveal/Copy actions.
3. Click **Move to Trash** → in the confirm dialog (default **Cancel**),
   click **Cancel**.
   - Expected: nothing changes — the file remains.
4. Open the file (active tab), press **⌘⌫**, then confirm **Move to Trash**.
   - Expected: the file moves to the OS Trash (verify in Finder), its tab
     closes, and the tree row disappears.
5. Open `src/app.ts` (so a tab under the folder is open). **Right-click
   the `src` folder row** → **Move to Trash**.
   - Expected: the confirm reads "Move _"src"_ and its contents to the
     Trash?".
6. Confirm.
   - Expected: the `src` folder and its contents move to Trash, the
     `src/app.ts` tab closes, and the folder row disappears.
7. Press **⌘⇧T** (reopen closed tab).
   - Expected: neither the trashed file nor the folder's file is reopened.

## Notes

- The keyboard shortcut (⌘⌫) only ever targets the active tab, which is
  always a file; folders are trashed only via the context menu.
- The confirm dialog is a UX safety gate, not a security control; the
  security boundary is workspace containment + recoverable Trash (see
  GRIDA-SEC-004 and `desktop/src/main/workspace-files.ts`).
- Containment logic is unit-tested in
  `desktop/src/main/workspace-files.test.ts`; this TC covers the
  end-to-end interaction the unit test can't.
- See also TC-DESKTOP-WORKBENCH-002 for the ⌘⌫-while-typing guard.
