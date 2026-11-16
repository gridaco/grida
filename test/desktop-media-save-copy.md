---
id: TC-DESKTOP-MEDIA-010
title: Retained media can be saved again after an export failure
module: desktop
area: media
tags: [media, recents, save, recovery]
status: untested
severity: medium
date: 2026-11-10
updated: 2026-11-10
automatable: false
covered_by:
  - desktop/src/sidecar/media-startup.test.ts
  - desktop/src/main/media-host.test.ts
---

## Behavior

Saving a copy is separate from generating and retaining a result. A failed
copy leaves the original available in Recents. The chooser is scoped to the
Tools window that opened it and the media item selected at that moment.

## Steps

1. Open a disposable generated result in Tools Recents.
2. Choose **Save a copy** and select an existing file in a disposable
   directory. If the operating system asks, confirm the selection.
3. Verify the failure feedback, the original contents of the existing file,
   and the same preview in Tools.
4. Restart Desktop, select the same recent item, and save to a new filename.
   Verify the saved file matches the retained result.
5. Open **Save a copy** again. If the platform allows navigation while the
   chooser is open, navigate away from Tools and then finish the selection.
   Verify that no new file appears.

## Notes

Use a retained fixture or previously generated result.
