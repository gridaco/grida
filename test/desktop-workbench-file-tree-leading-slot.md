---
id: TC-DESKTOP-WORKBENCH-008
title: File tree rows use one aligned leading slot
module: desktop
area: workbench
tags: [desktop, file-tree, alignment, folders]
status: untested
severity: low
date: 2026-07-28
updated: 2026-07-28
automatable: false
covered_by: []
---

## Behavior

Each workspace file-tree row uses exactly one leading slot after its depth
indentation. A folder uses the slot for its expand toggle without a separate
folder icon. A file or file-like bundle uses the same slot for its file icon
without reserving an invisible toggle. Names at the same depth therefore align
and retain more horizontal space.

## Steps

1. Open a Desktop workspace containing a root folder, a root file, and a
   `.canvas` bundle.
   - Expected: all three names begin at the same horizontal position.
2. Expand the root folder.
   - Expected: its toggle rotates, no folder icon appears, and the folder name
     remains aligned to the root file names.
3. Compare a child folder and child file at the same depth.
   - Expected: their names align with each other one indentation step farther
     right than the root rows.
4. Collapse and expand the folders, then open a file.
   - Expected: toggling, selection, and file activation continue to work.
