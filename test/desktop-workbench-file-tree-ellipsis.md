---
id: TC-DESKTOP-WORKBENCH-007
title: File tree ellipsizes stems and preserves extensions
module: desktop
area: workbench
tags: [desktop, file-tree, overflow, ellipsis]
status: untested
severity: medium
date: 2026-07-28
updated: 2026-07-28
automatable: false
covered_by: []
---

## Behavior

The workspace file tree follows the fixed-width explorer behavior demonstrated
by the `@grida/tree-view` VS Code example. When a file name cannot fit, only
the stem is shortened with an ellipsis and its final extension remains visible.
The name must not widen the tree or create horizontal scrolling. Dotfiles,
extensionless files, and folder names remain whole. Vertical scrolling and
normal tree interactions remain available.

## Steps

1. Open a Desktop workspace containing a file with a name wider than the
   file-tree pane.
2. Narrow the file-tree pane until the full name cannot fit.
   - Expected: the name's stem ends with an ellipsis while its extension, icon,
     and indentation remain visible.
3. Attempt to scroll horizontally with a trackpad or mouse while the pointer
   is over the file tree.
   - Expected: the file tree does not move horizontally.
4. Confirm that a dotfile, an extensionless file, and a folder containing a
   dot are not artificially split.
5. Scroll vertically, select the shortened row, and open the file.
   - Expected: vertical scrolling and all row interactions continue to work.
