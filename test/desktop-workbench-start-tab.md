---
id: TC-DESKTOP-WORKBENCH-003
title: Workspaces show and reopen a local Quick Start tab
module: desktop
area: workbench
tags: [workspace, tabs, canvas, slides, file-explorer, browser]
status: untested
severity: medium
date: 2026-07-23
updated: 2026-11-17
automatable: false
covered_by:
  - editor/scaffolds/desktop/workbench/workspace-canvas-creation.test.ts
  - editor/scaffolds/desktop/workbench/workbench-panels.test.ts
---

## Behavior

When the workspace has no open editors, the document region shows a selected,
non-closable Quick Start tab instead of an unexplained blank area. Quick Start
is local guidance. The automatic empty-workspace tab does not enter the editor
group. Opening any real or agent-owned tab replaces it; closing the final real
tab reveals Quick Start again.

The content-tab **+** button and **New Tab** (⌘T / Ctrl+T), including while a browser page is focused, open the same Quick Start actions in a single
closable panel tab alongside existing editors. Repeated presses reveal that
tab rather than creating duplicates. The **+** button is hidden when Quick
Start is the only tab, including the automatic empty-workspace view. Existing
file and browser tabs stay alive.
Quick Start never appears in reopen history, the agent's list of open surfaces,
or the remembered active artifact. The + button itself creates no browser page;
**Open Browser** on Quick Start replaces that tab with a browser at the same
position when the native browser is available.

The Quick Start surface offers direct ways into the workspace. File Explorer opens
the existing docked file tree. Creating a freeform canvas or slide deck writes
a uniquely named `Untitled.canvas`, `Untitled 2.canvas`, and so on, then opens
the new bundle immediately. Explore ideas is visible as a coming-soon
placeholder but performs no action.

When creation starts from the closable Quick Start panel, a successful canvas
or slide-deck creation likewise replaces that panel at its existing position.
If creation fails, Quick Start stays open and shows the error.

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
8. With a file or browser tab open, press **+**, then select another tab and
   press **+** again.
   - Expected: one closable Quick Start tab opens and is reused. Existing
     editors retain their state; no blank browser page is created.
9. Open another file after Quick Start, return to Quick Start and choose
   **Open Browser**.
   - Expected: the browser replaces Quick Start at its position in the strip.
     Other tabs keep their order and live state; no extra Quick Start tab
     remains. Unrelated reopen-closed history is preserved.
10. Press **+** again and close Quick Start without choosing an action.
    - Expected: closing Quick Start leaves the other tabs open, and
      reopen-closed does not resurrect Quick Start.
11. Repeat with **New freeform canvas** and **New slide deck** from a Quick
    Start panel between existing tabs.
    - Expected: each new document replaces Quick Start in place after creation
      succeeds. A failed creation keeps the Quick Start panel and its error.
