---
id: TC-DESKTOP-BROWSER-007
title: Website new-context actions preserve tab intent and window semantics
module: desktop
area: browser
tags: [browser, links, tabs, popups, forms, navigation]
status: untested
severity: high
date: 2026-11-18
updated: 2026-11-18
automatable: partial
covered_by:
  - desktop/src/main/browser-host.test.ts
  - desktop/src/main/browser-external-links.test.ts
  - packages/grida-desktop-bridge/src/browser.test.ts
  - editor/scaffolds/desktop/workbench/workspace-browser-tabs.test.ts
---

## Behavior

Deliberate top-document HTTP(S) new-tab links create content tabs with their
foreground/background intent and placement beside the opener. Website windows
remain real managed contexts when opener, names or form submission matter.
They preserve POST and script self-close behavior without receiving Desktop
capabilities. Cross-origin iframe new-context anchors use managed windows;
subframe Node integration is not enabled to turn them into content tabs.

## Steps

1. Use a controlled local page with ordinary `_blank` anchors, a link retaining
   `rel="opener"`, middle/modified-click targets, a named `window.open()`, a POST
   form targeting a new window, and a cross-origin iframe with a `_blank` link.
   Have the destination display its request method/body and opener messages.
2. Click the top-document `_blank` link. Repeat with middle-click and ⌘/Ctrl-click,
   then Shift plus the modifier. Expected: ordinary `_blank` selects a new
   content tab; background gestures preserve selection; Shift requests foreground.
   Open several children; their tabs remain together beside the opener.
3. Use the script/named-window action, opener-retaining link and POST form.
   Expected: managed website windows open in the browser profile. The named
   target is reusable, the POST destination receives the original POST/body,
   opener messaging works where website origin rules allow it, and a script
   can close its own window. No replacement GET is substituted.
4. Click the cross-origin iframe's `_blank` anchor. Expected: a managed website
   window opens. It is not promised to become a workbench content tab, and no
   subframe obtains Node or the application bridge.
5. In a managed window, navigate to a Desktop URL and try a further website
   window. Expected: browser ownership/profile policy continues to apply;
   visiting the URL grants no application role.
6. Navigate the opener website. Expected: Grida adds no rule that force-closes
   its windows solely for that navigation; normal Chromium lifecycle applies.
   Then close/crash the opener or reload the owning workbench. Expected:
   dependent managed windows end. Unrelated owners remain usable; website
   windows are not restored after app restart. A website window visiting a
   Desktop URL does not receive application-menu workspace commands.
7. Using a controlled fixture, reach the 64-content-tab limit for one owner or
   the separate 64-managed-window limit. Expected: a native capacity notice;
   existing pages remain and no unmanaged context escapes the limit.
8. On the top document, click controlled `mailto:`, `tel:` and `sms:` anchors
   with registered OS handlers. Expected: the chosen OS app handles the link
   without an extra Grida prompt. Drag/drop an ordinary HTTP(S) URL into a
   website guest/window; normal web navigation remains available.
9. Click a controlled custom-scheme link, cancel once, then accept. Repeat from
   the same origin/scheme and a different origin. Expected: the first accepted
   trusted click can be remembered only for its actual origin/scheme in this
   session; another origin asks again. Scripted attempts and the Chromium
   external-app permission route ask for an identified website context, even
   after click consent. Requests without attributable context cannot launch an app.
10. Keep an external-app confirmation pending while navigating/closing its
    source or replacing the workbench document. Expected: late acceptance cannot
    launch an app. Reset website permissions and repeat the trusted custom link;
    its remembered consent is gone. An unavailable handler leaves the page
    intact. Malformed, file, known executable and private Grida/internal schemes
    never launch through this browser handoff.

## Notes

No GUI execution has been recorded for this case. Record the operating system,
Electron version and exact click modifiers used when verifying it.
