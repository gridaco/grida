---
id: TC-DESKTOP-WORKBENCH-009
title: File tree rows have comfortable spacing and distinct states
module: desktop
area: workbench
tags: [desktop, file-tree, spacing, hover, selection]
status: untested
severity: low
date: 2026-07-28
updated: 2026-07-28
automatable: false
covered_by: []
---

## Behavior

Workspace file-tree rows keep Grida's neutral colors, typography, icons, and
rounded selection treatment while providing enough vertical and horizontal
space to scan comfortably. Hover, keyboard focus, and selection use distinct
neutral fills that remain visible in both light and dark themes.

## Steps

1. Open a Desktop workspace containing enough files and folders to fill most
   of the file-tree pane.
   - Expected: rows have a comfortable rhythm without looking like buttons or
     changing Grida's visual language.
2. Compare root entries with children inside an expanded folder.
   - Expected: root entries have breathing room from the pane edge and each
     nested depth remains visually clear.
3. Move the pointer across several unselected rows.
   - Expected: the hovered row has an immediate but neutral background change.
4. Select a row, then move the pointer elsewhere.
   - Expected: selection remains clearly stronger than hover.
5. Move keyboard focus through the tree.
   - Expected: focused rows remain distinguishable without competing with the
     selected state.
6. Repeat in light and dark themes.
   - Expected: spacing is unchanged and all three states remain visible.
