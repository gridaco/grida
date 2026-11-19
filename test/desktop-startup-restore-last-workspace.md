---
id: TC-DESKTOP-STARTUP-001
title: Cold launch restores the last focused Desktop window's content
module: desktop
area: startup
tags: [startup, workspace, welcome, restore, launch-intent]
status: untested
severity: high
date: 2026-07-23
updated: 2026-11-20
automatable: false
covered_by:
  - desktop/src/main/startup-window-policy.test.ts
  - editor/lib/desktop/window-content-state.test.ts
  - editor/lib/desktop/workspace-view-state.test.ts
  - editor/scaffolds/desktop/workbench/editor-group.test.ts
  - editor/scaffolds/desktop/workbench/workspace-surface-host.test.ts
---

## Behavior

A normal cold launch restores the last focused window's content. It opens Home,
the workspace workbench with its ordered real tabs, or the standalone `.canvas`
editor. The saved workspace ID and artifact paths must be revalidated through
the Desktop workspace bridge before restoration.

If no target was saved, it is no longer registered, or its directory is no
longer available, startup stays on Welcome. An explicit launch target (for
example, opening a supported file from Finder or a deep link) takes precedence
and must never briefly restore an unrelated workspace. Explicit Home, **File →
New Window**, and macOS dock reactivation remain Welcome actions rather than
implicit restoration.

## Steps

1. Start from a signed-in desktop session with no `grida.lastWorkspace` entry,
   quit the app completely, and relaunch it.
   - Expected: Welcome opens; no workspace is invented or selected.
2. Open workspace A, wait for its workbench to finish loading, quit the app,
   and relaunch it normally.
   - Expected: a brief **Restoring window…** state appears, then
     workspace A opens without a Welcome flash.
3. In workspace A's workbench, open three artifacts, then activate the middle
   tab. Quit and relaunch.
   - Expected: workspace A opens with all three real tabs in the same order and
     the middle tab active.
4. Open a temporary virtual tab while those artifacts remain open, quit, and
   relaunch.
   - Expected: the real artifacts reopen; the virtual tab is not persisted.
5. Repeat the virtual-tab case, but close every real artifact before quitting.
   - Expected: workspace A opens with an empty editor group. An artifact the
     user explicitly closed is not resurrected.
6. Open a `.canvas` directory inside workspace A as its dedicated editor,
   focus that window, quit, and relaunch.
   - Expected: the same canvas surface opens. Both explicit-manifest and
     implicit/manifest-less canvas directories are valid.
7. With workspace A saved, use **File → New Window** and then close every other
   window.
   - Expected: the new window stays on Welcome; it does not redirect to A.
8. Quit, then launch Grida by opening a supported file or `.canvas` directory
   from Finder.
   - Expected: the requested target wins. Workspace A is not restored in a
     competing window.
9. Quit, then rename or remove the saved workspace directory and relaunch.
   - Expected: startup falls back to Welcome and never recreates the missing
     directory.
10. Restore the directory, open two workspace windows, focus B last, quit, and
    relaunch.
    - Expected: B opens. This experiment restores one last-focused surface, not
      the complete multi-window session.
11. From the restored workbench, edit a file without saving, select another tab,
    then click **Home** and dismiss the confirmation.
    - Expected: the workbench stays open and the edit remains in its tab.
12. Return to the edited tab, save the edit, and click **Home** again.
    - Expected: the same window stays on Welcome without a confirmation or an
      automatic redirect. Back returns to the workspace.
13. Open a workspace from Home in the same window. Check the workspace title
    bar. Click **Home**, then go Back from Home and check the workspace title
    bar again.
    - Expected: Home appears first. The arrow that would return to Home is
      hidden in both cases. Back remains available from Home to the workspace.
14. Click **Home** in the workspace, wait for Home to display, then quit and
    relaunch.
    - Expected: Home opens, with the workspace still available in Recents.
15. Open a workspace from Home again, then go Back to Home. Quit and relaunch.
    - Expected: Home opens. Reopening the workspace restores its real tabs.

## Notes

- This test covers the content of one focused window. Workspace tab continuity
  uses its own saved state.
- Signed-out startup still follows the existing Welcome sign-in gate. After
  authentication it lands on Welcome rather than revealing prior-account
  workspace context.
