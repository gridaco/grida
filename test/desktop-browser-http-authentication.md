---
id: TC-DESKTOP-BROWSER-011
title: Website authentication answers only the live native challenge
module: desktop
area: browser
tags: [browser, authentication, proxy, navigation]
status: untested
severity: high
date: 2026-11-18
updated: 2026-11-18
automatable: partial
covered_by:
  - desktop/src/main/browser-auth-dialog.test.ts
  - desktop/src/main/browser-host.test.ts
---

## Behavior

HTTP authentication identifies the actual challenged site origin, or the host
and port of a proxy challenge. Its native credential form answers that live
browser challenge without giving credentials to hosted application UI. Pending
sign-in loses authority when the website navigates or its owner ends.

## Steps

1. Open a controlled HTTP(S) endpoint requiring HTTP authentication. Expected:
   the native sign-in form identifies the site's origin and challenge realm.
   Cancel once; no credentials are submitted.
2. Retry with test credentials. Expected: the challenged browser page can load,
   without changing Desktop account sign-in or provider credentials. Repeat in
   a managed website window.
3. Navigate/close the requesting page or reload its owning workbench while the
   form is open. Expected: the pending form closes or becomes ineffective; a
   late submission does not answer a replacement document's challenge.
4. Where a controlled authenticated proxy is available, repeat through it.
   Expected: the form explicitly identifies proxy sign-in and the actual proxy
   host/port, rather than presenting the target website as the proxy identity.

## Notes

This case is untested. Record proxy/platform availability and native form
interaction separately; adapter tests do not establish a working proxy setup.
