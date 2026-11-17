---
id: TC-DESKTOP-BROWSER-005
title: Browser Settings clears the shared browser data across all windows
module: desktop
area: browser
tags: [browser, settings, sessions, confirmation]
status: untested
severity: high
date: 2026-11-17
updated: 2026-11-18
automatable: partial
covered_by:
  - desktop/src/main/browser-host.test.ts
  - desktop/src/main/ipc-admission.test.ts
  - editor/lib/desktop/settings-browser.test.ts
  - editor/lib/desktop/settings-navigation.test.ts
---

## Behavior

Application Settings has one Browser category for the shared built-in browser.
It has no workspace selector or multiple-profile controls. The same full cleanup
is available from each browser tab. History-only clearing, cache-only clearing
and permission reset are separate operations. A native confirmation describes
the full reset's all-windows scope and defaults to Cancel. Cancellation preserves
every browser page and its website state. Confirmation force-closes all built-in
browser tabs and managed website windows, cancels accepted transfers, and clears
shared history, cookies, site storage, cache, HTTP authentication and remembered
website choices. Previously accepted certificate trust can remain cached until
Grida restarts. Desktop sign-in, provider credentials, workspace files and saved
downloads are separate.

Settings requires no selected or open workspace. It grants no page attachment,
navigation or capture authority and accepts no profile names or paths. A stale
or foreign document cannot authorize cleanup after navigation or role loss.
The UI discards late results and prevents duplicate requests while pending.
Older native versions show an update message and never reinterpret an older
workspace-only operation as a global one.

## Steps

1. Open the same controlled website in browser tabs in two workspaces/windows.
   Set a cookie/local storage in one; verify the other sees the shared state.
2. Open **Settings → Browser**.
   - Expected: one shared Browser category with no workspace/profile selector.
     Full browsing-data clearing is visibly distinct from the separate history,
     cache, permission and download controls.
3. Choose **Clear browsing data…**.
   - Expected: a native confirmation describes clearing all built-in browser
     tabs/windows and defaults to Cancel. Cancel; both pages and data remain.
4. Request cleanup again and confirm.
   - Expected: browser tabs and managed website windows close in every window,
     including pages with unsaved-change handlers. Accepted transfers are canceled.
     Reopening the site anywhere starts without its former cookie/local storage
     or browser history. Desktop sign-in, provider state, workspace files and
     downloaded files remain available.
5. Close every browser tab, then repeat cleanup through Settings.
   - Expected: cleanup works without a live browser page or workspace selection.
6. Repeat via a browser tab's **… → Clear browsing data…**.
   - Expected: the same native confirmation and global effect.
7. Close/navigate the initiating window while confirmation is pending.
   - Expected: a replacement document cannot spend the old confirmation.
8. Use a native browser version older than v4 or missing browser capability.
   - Expected: an update message, with no older scoped clear invoked.
9. In a disposable profile containing recognized legacy experimental browser
   partitions, confirm global clearing.
   - Expected: legacy browser data is cleared without merging sign-ins into the
     shared profile or touching account/provider partitions or symlink targets.
