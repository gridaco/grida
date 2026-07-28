---
id: TC-DESKTOP-WORKBENCH-012
title: Canvas renders refresh when a referenced workspace asset changes
module: desktop
area: workbench
tags: [workspace, canvas, image, file-watcher, projection]
status: verified
severity: high
date: 2026-07-29
updated: 2026-07-29
automatable: false
covered_by:
  - editor/scaffolds/desktop/canvas/slide-svg-resources.test.ts
  - editor/scaffolds/desktop/canvas/slide-thumbnail-projection-controller.test.ts
  - editor/scaffolds/desktop/workbench/workspace-file-revision.test.ts
  - editor/scaffolds/desktop/workbench/workspace-file-reload-guard.test.ts
  - editor/scaffolds/desktop/workbench/workspace-file-projection-dependencies.test.ts
---

## Behavior

A `.canvas` document represents the current contents of every local file it
renders, not only the current manifest or slide source. Overwriting an image at
the same bundle-relative path refreshes board pins, active slide resources,
slide thumbnails, and presentation pages without reopening the document.
Unrelated workspace writes do not refetch board pins, and a dependency update
never discards unsaved slide edits.

## Steps

1. Open a board `.canvas` containing a local image pin and note its contents.
2. Overwrite that image with a visibly different valid image at the same path.
   - Expected: the mounted pin updates without reopening the canvas.
3. Open a slides `.canvas` whose active SVG references a local image, then
   overwrite that image at the same path.
   - Expected: the active slide, its strip thumbnail, and its presentation page
     all update.
4. Make an unsaved edit in the active slide and overwrite its referenced image.
   - Expected: the unsaved edit stays intact. The new image projection appears
     after the editor becomes clean through save or reload.
5. Delete a referenced image, then recreate it at the same path.
   - Expected: the stale image disappears after deletion and the recreated
     image appears after the add event.

## Notes

Code tests cover workspace path matching, request identity, dependency
discovery, and black-to-red reprojection. This manual case remains for the
browser's decoded-image cache and the composed editor UI.
