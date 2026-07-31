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
2. From Finder, drop the checked-in asset `editor/public/west/poster.png`
   (2,910 × 4,338 px; 303,282 bytes; SHA-256
   `4439944baae26bd9895274f50445d9f16036457626714bb3297fee189e7b2c99`).
   Its 4,338 px longest edge deterministically exceeds the 1,568 px provider
   representation ceiling while its original bytes fit the scratch budget.
   - Expected: a thumbnail chip appears without an attachment error.
3. Send "What is shown in this black-and-white image?"
   - Expected: the model identifies multiple cowboys riding horses (and may
     mention birds or smoke) without a provider size error.

## Notes

- Downscaling affects only the provider-native perception representation. When
  the scratch budget permits, file operations use the original bytes.
- The byte caps and provider representation are covered by
  `image-attachment.test.ts` and `input-resource-router.test.ts`; the operating
  system drop gesture remains manual.
- 2026-07-30: Manually verified in local Grida Desktop with an oversized
  raster; it produced a thumbnail and remained perceivable without a provider
  size error. The checked-in high-resolution asset above makes future runs
  deterministic without modifying the engine-owned image fixture snapshot.
