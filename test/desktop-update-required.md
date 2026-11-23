---
id: TC-DESKTOP-UPDATE-001
title: Recover from a required Desktop update
module: desktop
area: update
tags: [startup, compatibility]
status: untested
severity: high
date: 2026-11-23
updated: 2026-11-23
automatable: false
covered_by:
  - desktop/src/main/desktop-updates.test.ts
  - desktop/src/main/desktop-update-feed.test.ts
  - desktop/src/main/desktop-update-window.test.ts
---

## Behavior

When the hosted editor requires a newer Desktop version, the bundled
update window shows the check and automatic download on macOS and Windows.
The installer becomes available if the update runs long. When a compatible
download finishes, the primary action restarts the app to install it. On Linux
the primary action opens the release page for the required version.

## Steps

1. On macOS or Windows, launch an installed, packaged build with this
   updater against a hosted editor that advertises a newer version line.
   Use an update feed with a compatible packaged release and a slow
   connection so the download stage remains visible.
2. Confirm the local window shows **Checking for updates…** and then
   **Downloading update…** with an indeterminate progress bar. On macOS,
   choose **Check for Updates…** while it downloads. Confirm the same
   window comes forward and continues showing the active download.
3. Confirm **Download installer** first appears after 45 seconds. Keep
   the download running past 10 minutes and confirm the bar disappears
   and **Download installer** becomes the primary action. Let the download
   finish. Choose **Restart to update** and confirm the installed version
   can open the hosted editor.
4. Repeat the check with the update feed unavailable. Confirm the window
   explains the failure and shows **Retry** and **Download installer**.
   Restore the feed and retry from the same window.
5. On Linux, launch a build with the same version skew and choose
   **Download installer**. Confirm the release page opens with the
   packages for the required version.
