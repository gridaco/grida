---
id: TC-DESKTOP-AGENT-CHAT-004
title: Attach multiple images in one agent turn
module: desktop
area: agent-chat
tags: [agent-chat, composer, image, multimodal, vision]
status: untested
severity: medium
date: 2026-06-07
updated: 2026-07-30
automatable: false
covered_by:
  - editor/kits/composer/composer-transfer.test.ts
  - editor/lib/agent-chat/input-resource-router.test.ts
---

## Behavior

Several images can be attached to a single message — by dropping multiple files
at once, or by pasting/dropping repeatedly before sending. Each becomes its own
thumbnail chip and provider-native `file` part, so the model can compare them in
one turn. Removing one chip (hover ✕) leaves the others intact.

## Steps

1. Open the desktop app, open a workspace, focus the agent composer.
2. Select two different supported raster images, such as PNG or JPEG files, in
   Finder and drag both onto the composer.
   - Expected: two thumbnail chips appear.
3. Paste a third supported raster image (**⌘V**) before sending.
   - Expected: a third chip appears.
4. Remove one chip via its hover ✕.
   - Expected: that chip disappears; the other two remain.
5. Type "compare these images" and send.
   - Expected: the reply references the remaining two images distinctly,
     confirming both reached the model in one turn.

## Notes

- `InputResourceRouter.prepareBatch` prepares each provider rendition and raw
  scratch body in attachment order under a bounded draft-retention budget.
  `InputResourceRouter.lower` emits the provider `file` parts plus the admitted
  scratch seed and ordered descriptors. If a chip is removed, retained twins
  are re-evaluated against the current submit-time scratch capacity.
- When the scratch budget permits, each original is staged as its own operable
  copy. A provider-capable image remains available for perception if its
  optional scratch copy cannot be admitted.
- Automated routing tests cover aggregate-budget arbitration: scratch-only
  resources reserve capacity before optional raster twins, and remaining
  provider-capable rasters fall back in attachment order. This manual case
  verifies the multi-gesture, card-removal, and model-comparison behavior.
- Chips + remove come from the composer kit's `ComposerAttachmentCards`.
- Watch the context meter: several inlined images add up — large sets can
  approach the context window (and are re-sent each turn until the deferred
  blob-store lands).
