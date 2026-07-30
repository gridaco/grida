---
id: TC-DESKTOP-AGENT-CHAT-002
title: Drag-and-drop an image file into the agent composer
module: desktop
area: agent-chat
tags: [agent-chat, composer, image, drag-drop, multimodal, vision]
status: verified
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

## Notes

- `ComposerContent.onTransfer` and `ComposerTransfer` preserve drop provenance;
  `InputResourceRouter` classifies supported raster types with
  `isSupportedImageType` (`image/svg+xml` excluded) and prepares the selected
  provider preview and scratch representation.
- Multiple files dropped at once each become their own chip (see
  TC-DESKTOP-AGENT-CHAT-004).
- The model round-trip is covered by the gated live test; the Finder gesture
  and rendered chip remain manual.
- 2026-07-30: Manually verified in local Grida Desktop. The dropped raster was
  perceived, its scratch-backed original remained operable on later turns, and
  the agent created the requested byte-for-byte copy without reattachment.
