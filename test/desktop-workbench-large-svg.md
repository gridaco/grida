---
id: TC-DESKTOP-WORKBENCH-014
title: Large SVGs with embedded images open, present, and save
module: desktop
area: workbench
tags: [workspace, canvas, svg, thumbnail, presentation]
status: verified
severity: high
date: 2026-11-19
updated: 2026-11-19
automatable: false
covered_by:
  - desktop/src/main/native-document-files.test.ts
  - desktop/src/main/native-workspace-reads.test.ts
  - packages/grida-daemon/src/http/routes/workspaces.read-svg-document.test.ts
---

## Behavior

An SVG source up to 8 MiB can be edited, previewed, and presented in
Desktop. Saving a slide preserves its embedded images and its authored
references to bundle files.

## Steps

1. In a local workspace, prepare a slides `.canvas` deck with an SVG around
   6.7 MiB containing a valid embedded PNG and a second image referenced by
   a relative path. Add a small second slide and keep a copy of the first
   slide outside the deck.
2. Open the copy as a standalone SVG and open the deck from the workbench.
   - Expected: the standalone document and the deck’s large slide load.
3. Check the large slide’s strip thumbnail, hover the deck tab, and present
   the deck. Navigate to the second slide and back.
   - Expected: the large slide and its images render in each deck view.
4. Move a shape on the large slide, save, and reopen the deck.
   - Expected: the shape’s position persists and both images still render.
     Inspect the saved SVG to verify that it retains the original embedded
     PNG bytes and the relative image reference.
5. Open an SVG whose source exceeds 8 MiB.
   - Expected: the editor names the file and shows its actual size and the
     supported limit.
