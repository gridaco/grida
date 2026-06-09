---
id: TC-DESKTOP-AGENT-CHAT-002
title: Drag-and-drop an image file into the agent composer
module: desktop
area: agent-chat
tags: [agent-chat, composer, image, drag-drop, multimodal, vision]
status: untested
severity: high
date: 2026-06-07
updated: 2026-06-07
automatable: false
covered_by: []
---

## Behavior

Dragging an image file from Finder (or another app) onto the agent composer
attaches it the same way a paste does: inline, perceive-only, downscaled +
base64-encoded into a `file` part. The drop is read from the drop event's bytes
in the renderer — the OS path is never resolved, so it works regardless of where
the file lives and never goes through the workspace-scoped agent fs.

Dropping a NON-image (e.g. a `.txt`) or an `.svg` must NOT become an image
attachment (SVG is text); those fall through to the editor's normal handling.

## Steps

1. Open the desktop app, open a workspace, focus the agent composer.
2. From Finder, drag a `.png`/`.jpg` onto the composer and drop.
   - Expected: a thumbnail chip appears; the editor text is unchanged.
3. Send "what is this?" → the model describes the dropped image's content.
4. Drag a large, high-resolution image (e.g. >5 MB or >2000px) and drop, then
   send.
   - Expected: it still sends and the model sees it (client downscale kept it
     under the provider limit — no provider error).
5. Drag a plain `.txt` file and drop.
   - Expected: it is NOT added as an image chip (non-image rejected at ingest).

## Notes

- `image/*` files are forwarded by the kit; the desktop handler filters with
  `isSupportedImageType` (raster only — `image/svg+xml` excluded) inside
  `encodeImageFile`.
- Multiple files dropped at once each become their own chip (see
  TC-DESKTOP-AGENT-CHAT-004).
- Downscale/cap policy + the model round-trip are covered by
  `image-attachment.test.ts` and the gated live test.
