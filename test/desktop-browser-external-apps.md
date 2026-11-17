---
id: TC-DESKTOP-BROWSER-013
title: Website external-app handoffs preserve consent and source ownership
module: desktop
area: browser
tags: [browser, external-apps, permissions, navigation]
status: untested
severity: high
date: 2026-11-18
updated: 2026-11-18
automatable: partial
covered_by:
  - desktop/src/main/browser-external-links.test.ts
  - desktop/src/main/browser-host.test.ts
---

## Behavior

Website links can open registered external applications without exposing Grida's
private schemes or native capabilities. Ordinary communication links use their
registered OS handlers. Custom-app consent belongs to the actual website origin
and scheme, and a document that navigates or closes cannot spend a pending
confirmation. Permission reset removes remembered consent.

## Steps

1. Open a controlled local website in the built-in browser, with `mailto:`,
   `tel:`, `sms:` and a custom-scheme link whose OS handlers are registered.
   Include scripted custom-scheme attempts and host it at a second origin.
2. Click the communication links. Expected: the chosen OS app handles each link
   without an extra Grida prompt.
3. Click the custom-scheme link, cancel once, then accept. Repeat from the same
   origin/scheme and the second origin. Expected: the first accepted trusted
   click can be remembered only for its actual origin/scheme in this session;
   another origin asks again. Scripted attempts and the Chromium external-app
   permission route ask for an identified website context, even after click
   consent. Requests without attributable context cannot launch an app.
4. Keep an external-app confirmation pending while navigating/closing its
   source or replacing the workbench document. Expected: late acceptance cannot
   launch an app.
5. Reset website permissions and repeat the trusted custom link. Expected:
   remembered consent is gone. An unavailable handler leaves the page intact.
   Malformed, file, known executable and private Grida/internal schemes never
   launch through this browser handoff.

## Notes

No GUI execution has been recorded for this case. Record the operating system,
registered handlers and Electron version when verifying it.
