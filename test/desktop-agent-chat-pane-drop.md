---
id: TC-DESKTOP-AGENT-CHAT-024
title: Drop a file anywhere on the agent chat pane
module: desktop
area: agent-chat
tags: [agent-chat, composer, file, drag-drop, side-chat]
status: untested
severity: medium
date: 2026-11-15
updated: 2026-11-15
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
text, so the same notices apply (one file at a time, folders, PNG-only images,
not ready). A drop on the composer text is handled once, never twice. Text
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
   - Expected: the notice asks for a file instead of a folder.
7. Drop a `.jpg` on the transcript.
   - Expected: the notice asks for a PNG.
8. Start a drag from Finder over the pane and press Escape.
   - Expected: the overlay disappears.
9. Select some text in the transcript and drag it over the pane.
   - Expected: no overlay.
10. Open a side chat tab and repeat steps 2–3 there.
    - Expected: the same overlay and intake in the side chat pane.

## Notes

- The pane uses `ComposerDropArea` (`editor/kits/composer/composer-drop-area.tsx`)
  with the same transfer handler the composer uses; acceptance and hover depth
  live in `ComposerDropZone`.
- Only drags whose `DataTransfer.types` include `"Files"` and that did not
  start in the document are accepted.
