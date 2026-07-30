---
id: TC-DESKTOP-AGENT-CHAT-002
title: Drag-and-drop an image file into the agent composer
module: desktop
area: agent-chat
tags: [agent-chat, composer, image, drag-drop, multimodal, vision]
status: untested
severity: high
date: 2026-06-07
updated: 2026-07-30
automatable: false
covered_by:
  - editor/kits/composer/composer-transfer.test.ts
  - editor/lib/agent-chat/image-attachment.test.ts
  - editor/lib/agent-chat/input-resource-router.test.ts
  - packages/grida-ai-agent/src/http/routes/agent.test.ts
  - packages/grida-ai-agent/src/runtime/runtime.live.test.ts
---

## Behavior

Dragging an image file from Finder (or another app) onto the agent composer
attaches it the same way a paste does: a bounded provider-native image for
immediate perception plus a byte-exact original staged into session scratch for
file operations. The drop is read from the drop event's bytes in the renderer —
the source OS path is never resolved or exposed, so it works regardless of
where the file lives.

Dropping a non-image (e.g. a `.txt`) or an `.svg` must NOT become a raster
preview. It follows the generic operable-file route into scratch instead.

## Steps

1. Open the desktop app, open a workspace, focus the agent composer.
2. From Finder, drag a supported raster image such as a `.png` or `.jpg` onto
   the composer and drop. Note its filename extension.
   - Expected: a thumbnail chip appears; the editor text is unchanged.
3. Send "what is this?" → the model describes the dropped image's content.
4. Send "Use the attachment's scratch path to make a byte-for-byte copy named
   `dropped-copy` with the same filename extension, then tell me its byte count."
   - Expected: the agent operates on the scratch copy without asking for a path
     or reattachment, and the copy preserves the original extension.
5. Drag a large, high-resolution image (e.g. >5 MB or >2000px) and drop, then
   send.
   - Expected: it still sends and the model sees it (client downscale kept it
     under the provider limit — no provider error).
6. Drag a plain `.txt` file and drop.
   - Expected: it is attached as a generic file, not a raster thumbnail, and the
     agent can read it from scratch.

## Notes

- `ComposerContent.onTransfer` and `ComposerTransfer` preserve drop provenance;
  `InputResourceRouter` classifies supported raster types with
  `isSupportedImageType` (`image/svg+xml` excluded) and prepares the selected
  provider preview and scratch representation.
- Multiple files dropped at once each become their own chip (see
  TC-DESKTOP-AGENT-CHAT-004).
- Downscale/cap policy + the model round-trip are covered by
  `image-attachment.test.ts` and the gated live test; the Finder gesture and
  rendered chip remain manual.
