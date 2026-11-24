---
id: TC-DESKTOP-BROWSER-002
title: Browser tabs preserve live pages and restore only recorded addresses
module: desktop
area: browser
tags: [browser, tabs, navigation, restore, shortcuts]
status: untested
severity: high
date: 2026-11-17
updated: 2026-11-22
automatable: partial
covered_by:
  - desktop/src/main/browser-host.test.ts
  - editor/scaffolds/desktop/workbench/workspace-browser-tabs.test.ts
  - editor/lib/desktop/workspace-view-state.test.ts
  - desktop/src/main/browser-host.electron.test.ts
---

## Behavior

Browser tabs are ordinary content tabs with their own navigation state. Tab
selection preserves a live page. Ordinary navigation and closure honor a
website's unsaved-change request through Stay/Leave; confirmed closure ends it.
Owner teardown and full browser reset remain forced. Reopen, chat switching,
and application restart restore recorded HTTP(S) addresses. Grida checks for
Stay/Leave before switching chats. Choosing Stay keeps the current chat open,
and any tabs already closed during the attempt reopen at their recorded URLs.
Generated live locations are transient and are not restore/reopen addresses.
Page-focused application shortcuts address the workbench, while ordinary text
editing and composition remain website input.
A new blank tab focuses the address bar. A tab opened at a known URL leaves
the address bar unfocused until the user selects it or presses Cmd/Ctrl+L.
A later successful full-document navigation retires an earlier navigation
error; starting, canceling or failing another load does not claim recovery.

## Steps

1. Launch Desktop with chat disabled, open a workspace, and open Browser from
   Quick Start. Verify **New Tab** in the native menu opens Quick Start after a file
   tab replaces it, then choose **Open Browser**. The blank tab focuses the
   address bar for typing.
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
5. On a controlled page with an active `beforeunload` handler, try navigation,
   reload, tab closure, and switching chats. Choose Stay, then repeat and
   choose Leave. Expected: Stay preserves the live document that asked and
   its tab, and Leave permits the requested action.
   A host document reload or full browser reset still ends pages without a
   website veto.
6. Close and reopen the browser tab. Expected: a new page opens at the recorded
   URL. Interleave file and browser tabs, restart Desktop and reopen the
   workspace. Expected: eligible addresses, ordering and selection restore;
   website cookies use the same shared profile in every workspace.
7. Stop the local server, reload and restart the server. Expected: failure and
   retry remain usable and do not close or reload the workbench.
8. Enter an invalid address while a healthy page contains unsaved form input.
   Expected: the action reports an error while the existing guest, history and
   form state remain. Correct the address or dismiss the error.
9. Reload the hosting workbench, then crash/recover it in a disposable profile.
   Expected: old guests and attachments end; eligible recorded addresses reopen
   as new documents. No form/history/scroll restoration is implied. Destroy a
   guest independently and retry; its tab remains usable without an automatic
   remount loop. A new window reconstructs a URL rather than adopting a guest.
10. Open a generated blank/blob/data document from a controlled website. Expected:
    it remains usable live content. Close/reopen or restart; no generated location
    is restored, added to shared history, handed to the default browser or used
    for favicon acquisition. Eligible ordinary HTTP(S) addresses still restore.
11. Exercise an older native build with browser protocol1/2/3 or no support.
    Expected: saved HTTP(S) addresses survive, an update message explains the
    unavailable presentation, no v4 calls are made, and file tabs remain usable.
12. Visit a working page, then navigate to an unreachable address. Press Back,
    and repeat with Forward or a site-triggered successful navigation. Expected:
    the recovered page is visible and interactive without an extra Reload.
    A pending/canceled load, another failure or an iframe commit must not
    dismiss the top-page error as if recovery had completed.
