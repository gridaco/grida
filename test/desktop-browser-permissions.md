---
id: TC-DESKTOP-BROWSER-008
title: Website consent remains scoped to the live browser request
module: desktop
area: browser
tags: [browser, permissions, devices, capture, privacy]
status: untested
severity: high
date: 2026-11-18
updated: 2026-11-18
automatable: partial
covered_by:
  - desktop/src/main/browser-site-policy.test.ts
  - desktop/src/main/browser-host.test.ts
---

## Behavior

Normal website features use native consent and actual source/device selection.
A permission decision does not grant Desktop, workspace or provider authority.
Site choices last for the app session, while OS permissions remain separate.
Resetting website permissions forgets choices and reloads open browser pages
and managed windows so an existing capture cannot keep using the old document.
Native device grants may require a Desktop restart, which reset must disclose.
Runtime identity and hardware limits are reported without claiming every
embedded request has a separately identified origin.

## Steps

1. Use controlled HTTP(S) origins with buttons for clipboard writes/reads,
   fullscreen, pointer lock, notifications, location and camera/microphone.
   Exercise ordinary active-page writes/fullscreen/pointer lock. Expected: normal
   behavior without an extra Grida consent dialog; Chromium gesture/OS rules
   still apply.
2. Request clipboard read, notifications, location and camera/microphone, first
   blocking and then, after reset, allowing. Expected: native consent identifies
   the website; repeat requests use the remembered site choice until reset or
   app quit. Camera/microphone can additionally require macOS system permission.
   An OS denial is not bypassed by the website's Allow choice.
3. Repeat a supported request in an embedded origin and in a generated document
   with an inherited origin. Expected: native security origins drive consent
   where requester identity is available. An opaque origin or ambiguous matching
   frames do not receive a guessed grant. Navigate or close the requesting page
   while a prompt is pending; its late answer cannot authorize a replacement.
4. Request screen capture. Cancel, then choose a specific available window or
   screen. Expected: only that actual selected video source is shared; the first
   source is never automatically chosen. System audio is unavailable here.
5. With supported hardware, request USB, HID, serial and Bluetooth devices.
   Expected: a native chooser selects an actual listed device, not every device
   with a similar name. Bluetooth can wait for discovery. Record unavailable
   platform/device paths; PIN/additional-validation Bluetooth pairing on
   Windows/Linux has no custom handler. Serial/Bluetooth labels identify the
   containing page because the pinned runtime omits requesting-frame identity.
   For USB, call the selected device's `forget()` method. Expected: the matching
   origin/device grant is removed, without affecting unrelated device grants.
6. Select a file/folder through Chromium's picker and exercise its requested
   read/write scope. Expected: consent applies to that selected resource;
   workspace membership grants no other path. Restricted-directory override is
   unavailable on the pinned runtime.
7. Start camera/screen capture in a tab and a managed window, then choose
   **Settings → Browser → Reset website permissions**. Include a page with an
   unsaved-change handler. Expected: open pages/windows reload despite that
   handler, active capture ends, and future requests need fresh consent.
   Unsaved form input can be discarded. OS grants are not reset.
   Repeat while closing/navigating Settings during reset. Expected: once the
   reset starts, page reload/termination still completes and active capture ends.
   Repeat with a controlled page whose server leaves the reload request pending.
   Expected: Main closes the stalled page, including a managed window, before
   reset reports success. Pages that commit their reload stay open.
   After a USB, HID or serial selection, expect a restart-required notice.
   Restart before asserting that the native device grant has ended; reopening
   a site before restart must not be described as proof of full revocation.
8. Relaunch Grida and repeat a site request. Expected: the app's in-memory site
   decision is gone; persistent website sign-in remains separate.

## Notes

This case is untested. Record actual OS consent, device availability and input
interaction separately from headless permission-adapter coverage.
