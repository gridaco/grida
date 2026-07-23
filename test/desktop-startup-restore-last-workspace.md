---
id: TC-DESKTOP-STARTUP-001
title: Cold launch resumes the last focused workspace, with Welcome fallback
module: desktop
area: startup
tags: [startup, workspace, welcome, restore, launch-intent]
status: untested
severity: high
date: 2026-07-23
updated: 2026-07-23
automatable: false
covered_by:
  - desktop/src/main/startup-window-policy.test.ts
  - editor/lib/desktop/last-workspace.test.ts
---

## Behavior

A normal cold launch should continue the last workspace-backed surface the
user focused: either its workbench or its `.canvas` editor. Restoration is a
convenience, not new filesystem authority: the saved opaque workspace ID and
relative canvas path must be revalidated through the desktop workspace bridge
before navigation.

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
   - Expected: a brief **Opening last workspace…** state appears, then
     workspace A opens without a Welcome flash.
3. Open a `.canvas` directory inside workspace A, focus that window, quit, and
   relaunch.
   - Expected: the same canvas surface opens. Both explicit-manifest and
     implicit/manifest-less canvas directories are valid.
4. With workspace A saved, use **File → New Window** and then close every other
   window.
   - Expected: the new window stays on Welcome; it does not redirect to A.
5. Quit, then launch Grida by opening a supported file or `.canvas` directory
   from Finder.
   - Expected: the requested target wins. Workspace A is not restored in a
     competing window.
6. Quit, then rename or remove the saved workspace directory and relaunch.
   - Expected: startup falls back to Welcome and never recreates the missing
     directory.
7. Restore the directory, open two workspace windows, focus B last, quit, and
   relaunch.
   - Expected: B opens. This experiment restores one last-focused surface, not
     the complete multi-window session.

## Notes

- This deliberately tests the narrow one-workspace experiment; full window
  session/crash recovery is a separate product decision.
- Signed-out startup still follows the existing Welcome sign-in gate. After
  authentication it lands on Welcome rather than revealing prior-account
  workspace context.
