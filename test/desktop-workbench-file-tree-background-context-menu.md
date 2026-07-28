---
id: TC-DESKTOP-WORKBENCH-010
title: File-tree background exposes workspace-root read-only actions
module: desktop
area: workbench
tags: [file-tree, context-menu, workspace]
status: untested
severity: medium
date: 2026-07-28
updated: 2026-07-28
automatable: false
covered_by: []
---

## Behavior

The unoccupied background below the file-tree rows represents the workspace
root. Right-clicking it opens the same location menu used by file and folder
rows, limited to meaningful read-only actions: **Reveal in Finder** and
**Copy path**. It never offers **Move to Trash**, and it omits
**Copy relative path** because the workspace root has no non-empty relative
path.

Row context menus remain independent. Right-clicking a file or folder row still
targets that exact entry and continues to offer its existing actions.

## Steps

1. Open a workspace containing few enough files that blank space remains below
   the tree rows.
2. Right-click the blank background below the final row.
   - Expected: the menu shows **Reveal in Finder** and **Copy path** only.
   - Expected: **Copy relative path** and **Move to Trash** are absent.
3. Click **Copy path**, then paste into a text field.
   - Expected: the pasted value is the absolute path of the workspace root.
4. Open the background menu again and click **Reveal in Finder**.
   - Expected: Finder reveals the workspace folder.
5. Right-click a file row and then a folder row.
   - Expected: each row menu targets its own entry and still contains
     **Copy relative path** and **Move to Trash**.

## Notes

The background trigger is a sibling of the row triggers rather than an outer
wrapper, preventing nested context menus from competing for the same
right-click.
