---
id: TC-DESKTOP-AGENT-CHAT-009
title: Drop a large raster without exceeding provider limits
module: desktop
area: agent-chat
tags: [agent-chat, composer, image, drag-drop, multimodal, vision, limits]
status: verified
severity: high
date: 2026-07-30
updated: 2026-07-30
automatable: false
covered_by:
  - editor/lib/agent-chat/image-attachment.test.ts
  - editor/lib/agent-chat/input-resource-router.test.ts
  - packages/grida-ai-agent/src/runtime/runtime.live.test.ts
---

## Behavior

A large raster dropped into a workspace-bound agent composer remains
perceivable without sending provider-hostile source bytes. The provider-native
representation is bounded independently from the byte-exact scratch twin, so
provider limits do not silently make the attachment unusable.

## Steps

1. Open the desktop app, open a workspace, and focus the agent composer.
2. From Finder, drop a large, high-resolution raster image such as a file over
   5 MB or 2000 pixels on one side.
   - Expected: a thumbnail chip appears without an attachment error.
3. Send a prompt asking for one visually verifiable detail from the image.
   - Expected: the model describes the image without a provider size error.

## Notes

- Downscaling affects only the provider-native perception representation. When
  the scratch budget permits, file operations use the original bytes.
- The byte caps and provider representation are covered by
  `image-attachment.test.ts` and `input-resource-router.test.ts`; the operating
  system drop gesture remains manual.
- 2026-07-30: Manually verified in local Grida Desktop. The large raster
  produced a thumbnail and remained perceivable without a provider size error.
