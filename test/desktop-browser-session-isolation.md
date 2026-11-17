---
id: TC-DESKTOP-BROWSER-003
title: Browser tabs share website state while isolating Desktop authority
module: desktop
area: browser
tags: [browser, sessions, security, permissions]
status: untested
severity: high
date: 2026-11-17
updated: 2026-11-18
automatable: partial
covered_by:
  - desktop/src/main/browser-host.test.ts
  - desktop/src/main/browser-host.electron.test.ts
  - packages/grida-desktop-bridge/src/browser.test.ts
---

## Behavior

Browser pages cannot obtain Desktop authority by loading a Desktop URL.
All browser pages share one persistent website profile across workspaces and
windows. There are no per-workspace or private-page storage scopes.
Browser actions never expose application account cookies, provider credentials
or private workspace protocol access to the page.

## Steps

1. Use a controlled local site that sets a cookie and local storage. Open two
   pages in the same workspace. Expected: they share website state.
2. Open that site in another workspace/window. Expected: it shares the same
   website state. Close every browser tab and reopen it; the shared sign-in
   survives. One owner still cannot invoke native commands on another
   owner's page merely because their website cookies are shared.
3. Navigate a browser tab to the local editor's Desktop URL. Expected: it has
   no application bridge and cannot hide, sign out or navigate its owning
   workbench. Return to the test site.
4. Exercise website windows, native consent, HTTP authentication, `alert()` and
   `confirm()`. Expected: these ordinary features retain browser-only authority
   and the shared website profile. Electron42.2 `prompt()` is unsupported by the
   runtime, not denied as a Grida permission. Use the dedicated links, permission
   and authentication cases for detailed interaction checks.
5. Download a small file with default settings, then with optional destination
   prompting. Expected: its admitted destination stays under the browser download
   policy and nothing opens automatically; no application or workspace authority
   is granted by saving it.
6. Choose **… → Clear browsing data…**. Expected: the native
   confirmation defaults to Cancel. Cancel once, then confirm on a second
   attempt. Cancellation preserves the pages; confirmation closes them, their
   shared website state is cleared everywhere, and Desktop sign-in/provider
   sessions remain unchanged.
7. In a disposable harness, attempt forged, duplicate, replayed, expired and
   previous-document mounts, hostile partition/preload/preferences and nested
   guests. Expected: Main admits only the actual guest for the exact live
   owner/page; no website loads before registration and policy installation.
8. Test page-origin forbidden links/redirects separately from trusted webview
   built-in programmatic loads. Expected: ordinary forbidden navigation is
   canceled; file/private/executable document destinations remain refused.
   Website-generated blank/blob/data documents can remain live sandboxed content
   without gaining Desktop authority or becoming persisted addresses. A forbidden
   programmatic load bypassing cancellable hooks is contained asynchronously;
   this does not prove no script executed, since the trusted workbench already
   has intrinsic own-guest scripting authority.
9. Exercise actual registered guest CDP evaluation, screenshot and input in a
   disposable native fixture. Verify isolation and page identity separately
   from raw target discovery. If Playwright is used, record whether it exposes
   an ordinary guest Page rather than assuming target discovery implies it.
