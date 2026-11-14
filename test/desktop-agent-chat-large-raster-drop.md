---
id: TC-DESKTOP-AGENT-CHAT-009
title: An oversize PNG is refused and the draft is kept
module: desktop
area: agent-chat
tags: [agent-chat, composer, image, drag-drop, multimodal, limits]
status: untested
severity: high
date: 2026-07-30
updated: 2026-11-13
automatable: false
covered_by:
  - editor/lib/agent-chat/native-chat-controller.test.ts
  - desktop/src/main/native-agent-images.test.ts
---

## Behavior

Native chat accepts one PNG of at most 256 KiB within the supported image
dimensions. A larger PNG is not resized or sent. The composer explains the
limit, keeps the typed text, and blocks the send until the person removes or
replaces the attachment. Nothing reaches the model.

## Steps

1. Open Desktop, open a workspace, and focus the native agent composer.
2. Type "What is shown in this image?".
3. From Finder, drop the checked-in asset `editor/public/west/poster.png`
   (303,282 bytes, above the 256 KiB limit).
   - Expected: the composer says to choose a PNG of at most 256 KiB and the
     typed text remains.
4. Try to send.
   - Expected: nothing is sent and the draft stays.
5. Remove the attachment and attach a PNG under 256 KiB, then send.
   - Expected: the message and image send together.

## Notes

- The previous chat downscaled a large raster for the provider and kept the
  original in scratch. Native chat refuses it instead.
- The Main test refuses a PNG one byte over the limit before any request.
