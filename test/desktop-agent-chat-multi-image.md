---
id: TC-DESKTOP-AGENT-CHAT-004
title: Attach multiple images in one agent turn
module: desktop
area: agent-chat
tags: [agent-chat, composer, image, multimodal, vision]
status: untested
severity: medium
date: 2026-06-07
updated: 2026-11-24
automatable: false
covered_by:
  - crates/grida-agent/tests/process/attachment_batches.rs
---

## Behavior

Several images can be attached to a single message — by dropping multiple files
at once, or by pasting/dropping repeatedly before sending. Each gets a thumbnail card and its own provider image part, so the model can compare them in
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
   - Expected: both images display in the transcript and open fullscreen.
6. While a turn is running, send another message with two images. With that
   message at the head of the queue, choose **Steer**.
   - Expected: both images display with the message inside the running turn.
     After the turn settles, reopen the chat and expand its activity. Both
     images still display in the same place and open fullscreen.
