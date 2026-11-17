---
id: TC-DESKTOP-BROWSER-003
title: Browser website state remains separate from Desktop and other workspace profiles
module: desktop
area: browser
tags: [browser, sessions, security, permissions]
status: untested
severity: high
date: 2026-11-17
updated: 2026-11-17
automatable: partial
covered_by:
  - desktop/src/main/browser-host.test.ts
  - desktop/src/main/browser-host.electron.test.ts
  - packages/grida-desktop-bridge/src/browser.test.ts
---

## Behavior

Browser pages cannot obtain Desktop authority by loading a Desktop URL.
Website storage belongs to a workspace browser profile or one ephemeral page.
Browser actions never expose application account cookies, provider credentials
or private workspace protocol access to the page.

## Steps

1. Use a controlled local site that sets a cookie and local storage. Open two
   persistent pages in the same workspace. Expected: they share website state.
2. Open that site in another workspace. Expected: its browser profile starts
   separately. Per-page ephemeral isolation and cleanup are covered by the
   native host tests; the workbench offers no private-page creation button.
3. Navigate a browser tab to the local editor's Desktop URL. Expected: it has
   no application bridge and cannot hide, sign out or navigate its owning
   workbench. Return to the test site.
4. Exercise a denied scheme, redirect, popup, camera/microphone request, HTTP
   authentication and JavaScript dialog. Expected: the stated browser policy
   applies without creating an unmanaged window or changing Desktop authority.
5. Download a small test file. Cancel once and accept a native destination
   once. Expected: cancellation writes no completed file; acceptance saves only
   at the selected location and never opens it automatically.
6. Choose **… → Clear workspace browser data…**. Expected: the native
   confirmation defaults to Cancel. Cancel once, then confirm on a second
   attempt. Cancellation preserves the pages; confirmation closes them, their
   website state is cleared, and other workspace profiles and Desktop sign-in
   remain unchanged.
