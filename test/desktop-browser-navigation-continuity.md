---
id: TC-DESKTOP-BROWSER-002
title: Browser tabs preserve live pages and restore only recorded addresses
module: desktop
area: browser
tags: [browser, tabs, navigation, restore, shortcuts]
status: untested
severity: high
date: 2026-11-17
updated: 2026-11-17
automatable: partial
covered_by:
  - editor/scaffolds/desktop/workbench/workspace-browser-tabs.test.ts
  - editor/lib/desktop/workspace-view-state.test.ts
  - desktop/src/main/browser-host.electron.test.ts
---

## Behavior

Browser tabs are ordinary content tabs with their own navigation state. Tab
selection preserves a live page; closure ends it. Reopen and application
restart use recorded addresses without promising to restore form values or
history. Page-focused application shortcuts address the workbench, while
ordinary text editing and composition remain website input.

## Steps

1. Launch Desktop with chat disabled, open a workspace, and open Browser from
   Quick Start. Verify the native menu can also open a browser after a file
   tab replaces Quick Start.
2. Navigate through two local pages and a same-document history change. Use
   Back, Forward, Reload and Stop. Expected: toolbar state reflects the page's
   actual history and loading state.
3. Type in a page form, switch to a workspace document, then return. Expected:
   the form value and live guest identity remain. Repeat after a React UI
   remount and same-document presentation/group movement; neither may rewrite
   the source or recreate the guest. Saving, copying a file path or trashing
   a workspace file must not target the browser URL.
4. With page input focused, exercise copy/paste, text selection and IME where
   available. Exercise location focus, tab switching and close-tab shortcuts.
   Expected: input edits remain in the page and application commands reach the
   correct browser or workbench target without duplicate actions.
5. Close and reopen the browser tab. Expected: a new page opens at the recorded
   URL. Interleave file and browser tabs, restart Desktop and reopen the
   workspace. Expected: eligible addresses, ordering and selection restore;
   ephemeral browser tabs do not restore.
6. Stop the local server, reload and restart the server. Expected: failure and
   retry remain usable and do not close or reload the workbench.
7. Enter an invalid address while a healthy page contains unsaved form input.
   Expected: the action reports an error while the existing guest, history and
   form state remain. Correct the address or dismiss the error.
8. Reload the hosting workbench, then crash/recover it in a disposable profile.
   Expected: old guests and attachments end; eligible recorded addresses reopen
   as new documents. No form/history/scroll restoration is implied. Destroy a
   guest independently and retry; its tab remains usable without an automatic
   remount loop. A new window reconstructs a URL rather than adopting a guest.
9. Exercise an older native build with browser protocol1 or no browser support.
   Expected: saved browser addresses survive, an update message explains the
   unavailable presentation, no v2 calls are made, and file tabs remain usable.
