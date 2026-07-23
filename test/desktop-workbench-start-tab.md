---
id: TC-DESKTOP-WORKBENCH-003
title: Empty workspaces show a local Quick Start tab
module: desktop
area: workbench
tags: [workspace, tabs, canvas, slides, file-explorer]
status: untested
severity: medium
date: 2026-07-23
updated: 2026-07-23
automatable: false
covered_by:
  - editor/scaffolds/desktop/workbench/workspace-canvas-creation.test.ts
---

## Behavior

When the workspace has no open editors, the document region shows a selected,
non-closable Quick Start tab instead of an unexplained blank area. Quick Start
is local guidance rather than a real editor-group tab: it does not appear in reopen
history, the agent's list of open surfaces, or the remembered active artifact.
Opening any real or agent-owned tab replaces it; closing the final real tab
reveals Quick Start again.

The Quick Start surface offers direct ways into the workspace. File Explorer opens
the existing docked file tree. Creating a freeform canvas or slide deck writes
a uniquely named `Untitled.canvas`, `Untitled 2.canvas`, and so on, then opens
the new bundle immediately. Explore ideas is visible as a coming-soon
placeholder but performs no action.

## Steps

1. Open a workspace with no remembered active artifact.
   - Expected: after restoration settles, the title bar contains a selected
     `Quick Start` tab with no close control, and the main panel shows the
     compact start actions.
2. Choose **Open File Explorer**.
   - Expected: the action advertises `⌘B`; choosing it opens the file tree in
     the right column, and Quick Start remains visible until a file is selected.
3. Select a file in the explorer, then close its editor tab.
   - Expected: the file opens normally; after the final real tab closes, Quick
     Start returns. Quick Start itself is not present in reopen-closed history.
4. Choose **New freeform canvas**.
   - Expected: `Untitled.canvas` is created in the workspace, appears in the
     explorer if it is open, and opens in the freeform canvas editor.
5. Close the canvas editor and choose **New slide deck**.
   - Expected: `Untitled 2.canvas` is created and opens in the slides editor.
6. Close and reopen the workspace with a remembered real artifact.
   - Expected: Quick Start does not flash while the artifact is being restored.
7. Inspect **Explore ideas** with pointer and keyboard navigation.
   - Expected: it is visibly marked `Coming soon`, is disabled, and does not
     open the existing attachment dialog or create a Library tab.
