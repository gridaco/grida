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
   the form value and live page remain. Saving, copying a file path or trashing
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
