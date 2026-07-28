---
id: TC-DESKTOP-WORKBENCH-011
title: Open media tabs refresh after their workspace file changes
module: desktop
area: workbench
tags: [workspace, tabs, image, video, file-watcher]
status: verified
severity: high
date: 2026-07-29
updated: 2026-07-29
automatable: false
covered_by:
  - editor/scaffolds/desktop/workbench/workspace-file-revision.test.ts
---

## Behavior

An open image or video tab represents the current file on disk, not the bytes
that happened to exist when the tab first opened. When another app or the agent
overwrites that same workspace path, the mounted viewer reloads it without the
user closing the tab, refreshing the page, or changing the filename. The
refresh applies to inactive open tabs as well, because switching tabs preserves
their mounted viewer state.

## Steps

1. Open a workspace image as a Files tab and note its visible contents.
2. Without closing the tab, overwrite that exact file from the agent, Terminal,
   or another application with a visibly different valid image.
   - Expected: the open image tab updates to the new contents after the
     workspace change event; it does not continue showing the previous decode.
3. Keep the image tab open but inactive, overwrite it again, then return to it.
   - Expected: the newly written image is already shown.
4. Repeat with a workspace video, replacing it with another valid video at the
   same path.
   - Expected: the video element reloads the replacement rather than retaining
     the old metadata or frames.
5. Delete an open image or video from outside Grida.
   - Expected: the viewer stops presenting the removed file and shows its load
     failure state.

## Notes

The streamed Desktop path and the capped base64 fallback both follow the same
workspace-change revision. The streamed route already disables response
caching; changing the media request identity is what asks Chromium to fetch the
new bytes.
