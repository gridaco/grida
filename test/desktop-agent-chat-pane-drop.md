---
id: TC-DESKTOP-AGENT-CHAT-024
title: Drop a file or folder anywhere on the agent chat pane
module: desktop
area: agent-chat
tags: [agent-chat, composer, file, folder, drag-drop, side-chat]
status: untested
severity: medium
date: 2026-11-15
updated: 2026-11-16
automatable: false
covered_by:
  - editor/kits/composer/composer-drop-zone.test.tsx
  - editor/kits/composer/composer-drop-area.browser.tsx
---

## Behavior

The whole native agent chat pane — header, transcript and composer — accepts
a file or folder dragged from the operating system. While such a drag is over
the pane, a neutral dashed overlay labelled "Drop to attach" covers it; moving
across the transcript, header or composer does not make it flicker. The
overlay disappears when the drag leaves the pane, on drop, when the drag is
cancelled with Escape, and when the window loses focus.

A drop anywhere in the pane takes the same intake as a drop on the composer
text, so the same single-attachment, host-capability and readiness checks
apply. A folder becomes a reference with no size or preview; it is never read
as an empty file. A drop on the composer text is handled once, never twice. Text
drags and drags that start inside the app (for example a slide or an image in
the transcript) do not show the overlay and keep their existing behaviour.

## Steps

1. Open Grida Desktop with a workspace and the native agent chat open.
2. From Finder, drag a `.txt` file over the transcript, move it over the chat
   header and over the composer, then back out of the window.
   - Expected: the overlay appears on entering the pane, stays steady while
     moving across those areas, and disappears on leaving.
3. Drop the `.txt` file on the transcript.
   - Expected: one generic file chip appears in the composer.
4. Remove it, then drop the file on the chat header.
   - Expected: the same single chip appears.
5. Remove it, then drop the file on the composer text.
   - Expected: exactly one chip, with no duplicate notice or second attempt.
6. Drop a folder on the transcript.
   - Expected: one folder-reference chip appears with no size or preview.
     Repeat on the header and composer: each drop is handled once. On an older
     Main build without folder-reference support, the draft and current
     attachment remain and an unsupported/update notice appears.
7. Drop a `.jpg` on the transcript.
   - Expected: it follows the explicit raster-image intake in
     TC-DESKTOP-AGENT-CHAT-021, including draft-preserving refusal on a model
     without image input.
8. Start a drag from Finder over the pane and press Escape.
   - Expected: the overlay disappears.
9. Select some text in the transcript and drag it over the pane.
   - Expected: no overlay.
10. Open a side chat tab and repeat steps 2–3 there.
    - Expected: the same overlay and intake in the side chat pane.
11. Drop a file and folder together while a draft and attachment are present.
    - Expected: the one-attachment notice preserves both; no folder is read
      and neither attachment is replaced.

12. Return to Home and drag a file over the gallery, workspace picker and
    composer, including when the composer is docked at the bottom.
    - Expected: the shared overlay covers the whole Home window without flicker;
      dropping anywhere stages one attachment and starts no work. Dropping
      directly on the editor is also handled once. Leaving, cancelling or
      blurring clears the overlay. Internal gallery-image drags show no overlay.

## Verification

Automated verification on 2026-11-15:

- Renderer fixtures: 183 passed, including intake and retained-draft checks.
  Main/preload reference fixtures: 21 passed.
- Desktop suite: 763 passed, 98 skipped. Native Rust workspace: 967 passed,
  73 ignored; TC-DESKTOP-AGENT-CHAT-025 records its folder-reference process
  coverage.
- Full typecheck: 63 tasks passed. Lint: no errors and one existing warning.
  English docs production build passed.

Manual status remains untested. The complete operating-system drop flow,
overlay behavior across the pane and older-host presentation are pending human
QA. No successful Finder drop was verified before that handoff; the app was
left open and no live provider turn was submitted during the QA handoff.

## Notes

- The pane uses `ComposerDropArea` (`editor/kits/composer/composer-drop-area.tsx`)
  with the same transfer handler the composer uses; acceptance and hover depth
  live in `ComposerDropZone`.
- Only drags whose `DataTransfer.types` include `"Files"` and that did not
  start in the document are accepted.
