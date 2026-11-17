---
id: TC-DESKTOP-BROWSER-010
title: An accepted browser download owns its destination and lifetime
module: desktop
area: browser
tags: [browser, downloads, settings, files, lifecycle]
status: untested
severity: high
date: 2026-11-18
updated: 2026-11-18
automatable: partial
covered_by:
  - desktop/src/main/browser-downloads.test.ts
  - desktop/src/main/browser-host.test.ts
  - editor/lib/desktop/settings-browser.test.ts
---

## Behavior

Downloads normally save to the system Downloads directory or a browser-wide
folder chosen through a native dialog. Asking for each destination is optional.
Only a live admitted website can initiate acceptance, but an accepted transfer
can continue after its tab closes while Grida runs. Websites and hosted UI do
not choose arbitrary native destination paths. Completed files never open or
execute automatically.

## Steps

1. In a disposable profile, download a small controlled file with default Browser
   settings. Expected: it saves in the system Downloads directory without an
   extra save-location prompt and does not open automatically.
2. Download the same filename again, with an existing file already present.
   Expected: default saving uses a collision-free name and preserves the existing
   file. Try a filename containing path separators or reserved characters;
   only a sanitized filename is used under the destination folder.
3. In **Settings → Browser**, choose another download folder through the native
   chooser. Expected: the UI displays the folder name, not its full private
   native path. Subsequent downloads use that folder; relaunch preserves the
   browser preference. Canceling the chooser preserves the prior selection.
4. Enable **Ask where to save each file**. Cancel one save dialog, then accept a
   destination for another download. Expected: cancellation produces no completed
   download; acceptance uses the selected destination. Disable the option and
   verify normal default saving returns.
5. Start a deliberately slow download, accept it, then close the originating tab.
   Expected: the accepted native transfer can finish while Grida remains open.
   Repeat with a managed website window. Closing a page is not a promise to
   cancel a job whose destination was already admitted.
6. While destination selection is pending, remove its owning page/window.
   Expected: an expired owner cannot authorize a new destination. Exercise an
   unwritable destination separately; a clear error directs the person to choose
   a writable download folder.
7. Start another accepted slow transfer and confirm **Clear browsing data…**.
   Expected: the retained transfer is canceled along with browser reset. Previously
   completed downloads remain on disk and are not opened automatically.

## Notes

This case is untested. Automatic file opening, background completion after the
entire application exits, download-manager UI and malware scanning are not
claimed by this behavior.
