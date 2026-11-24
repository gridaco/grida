---
id: TC-DESKTOP-WINDOW-001
title: Show new Desktop windows in the saved appearance
module: desktop
area: window
tags: [appearance]
status: untested
severity: medium
date: 2026-11-23
updated: 2026-11-23
automatable: false
covered_by:
  - desktop/src/window.test.ts
---

## Behavior

A new Grida Desktop window appears once the page has painted in the
selected appearance. The first visible frame respects explicit Light or
Dark and follows the OS when the selection is System.

## Steps

1. Set the OS to Light and choose **Dark** in Grida Desktop’s Appearance
   settings. Close Settings.
2. Reopen Settings, choose **File → New Window**, and open a document in a
   new window. Confirm the first visible frame is dark each time.
3. Set the OS to Dark and choose **Light** in Grida Desktop. Repeat the
   window opens and confirm the first visible frame is light.
4. Select **System** and repeat in both OS appearances.
5. Repeat on a slow connection. Then disconnect and open a new window.
   Confirm a failed navigation offers a native error and the window can
   be reopened after reconnecting.
