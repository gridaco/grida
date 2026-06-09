---
id: TC-DESKTOP-AGENT-CHAT-004
title: Attach multiple images in one agent turn
module: desktop
area: agent-chat
tags: [agent-chat, composer, image, multimodal, vision]
status: untested
severity: medium
date: 2026-06-07
updated: 2026-06-07
automatable: false
covered_by: []
---

## Behavior

Several images can be attached to a single message — by dropping multiple files
at once, or by pasting/dropping repeatedly before sending. Each becomes its own
thumbnail chip, each is sent as its own `file` part, and the model can compare
them in one turn. Removing one chip (hover ✕) leaves the others intact.

## Steps

1. Open the desktop app, open a workspace, focus the agent composer.
2. Select two different images in Finder and drag both onto the composer.
   - Expected: two thumbnail chips appear.
3. Paste a third image (**⌘V**) before sending.
   - Expected: a third chip appears.
4. Remove one chip via its hover ✕.
   - Expected: that chip disappears; the other two remain.
5. Type "compare these images" and send.
   - Expected: the reply references the remaining two images distinctly,
     confirming both reached the model in one turn.

## Notes

- Each image is independently downscaled/encoded by `encodeImageFile`; all
  qualifying `file-attachment` parts are mapped to `file` parts by
  `toFileUiParts` on submit.
- Chips + remove come from the composer kit's `ComposerAttachmentCards`.
- Watch the context meter: several inlined images add up — large sets can
  approach the context window (and are re-sent each turn until the deferred
  blob-store lands).
