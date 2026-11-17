---
id: TC-DESKTOP-BROWSER-005
title: Browser Settings clears website data for the selected workspace
module: desktop
area: browser
tags: [browser, settings, sessions, confirmation]
status: untested
severity: high
date: 2026-11-17
updated: 2026-11-17
automatable: partial
covered_by:
  - desktop/src/main/browser-host.test.ts
  - desktop/src/main/ipc-admission.test.ts
  - editor/lib/desktop/settings-browser.test.ts
  - editor/lib/desktop/settings-navigation.test.ts
---

## Behavior

Application Settings has a Browser category for managing existing workspace
website data. The user explicitly selects a registered workspace before
requesting cleanup. A native confirmation names that workspace and defaults
to Cancel. Cancellation preserves its live pages and stored website state.
Confirmation closes that workspace's browser pages across windows and clears
its cookies, site storage, cache and HTTP authentication. Other workspace
profiles and the application sign-in keep their separate state. Downloaded
files and remembered tab addresses have separate lifetimes.

The Settings surface grants no page attachment, navigation or capture
authority. It cannot supply arbitrary profile names or paths. A stale or
foreign Settings document cannot authorize cleanup after navigation, role
loss or a change to the selected workspace's registered identity. The UI
discards late results after its lifecycle ends and prevents duplicate requests
while an operation is pending.

The page describes the browser's current download and sensitive-permission
policies without presenting unsupported configuration switches. Older native
builds without the management operation show an availability message.

## Steps

1. Open two workspaces with a controlled local website that sets a cookie and
   local storage. Confirm each workspace has independent website state.
2. Open application Settings and choose **Browser**.
   - Expected: the workspace selector lists registered workspaces. Clearing
     stays disabled until a workspace is selected.
3. Select the first workspace and choose **Clear cookies and site data…**.
   - Expected: a native confirmation identifies that workspace and defaults
     to Cancel. Cancel it; its browser pages and website state remain.
4. Request cleanup again and confirm.
   - Expected: the selected workspace's browser tabs close. Reopening the
     website starts without its previous cookie or local storage. The second
     workspace's page, website state and Desktop sign-in remain available.
5. Close all browser tabs in the second workspace, then clear its website data
   through Settings and reopen the site.
   - Expected: cleanup also works without a live page or workspace attachment.
6. Switch Settings categories or close the window while a request is pending.
   - Expected: no result later appears in another section or triggers cleanup
     under a replacement Settings document.
7. Use a native build without the optional Settings management method.
   - Expected: the Browser category explains that the operation is unavailable
     without attempting to attach a page or weakening workspace admission.
