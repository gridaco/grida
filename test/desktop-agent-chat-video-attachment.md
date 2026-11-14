---
id: TC-DESKTOP-AGENT-CHAT-026
title: A video attachment shows a poster frame, duration and size
module: desktop
area: agent-chat
tags: [agent-chat, composer, video, drag-drop, reference, history]
status: untested
severity: high
date: 2026-11-15
updated: 2026-11-15
automatable: partial
covered_by:
  - editor/lib/agent-chat/video-attachment.test.ts
  - editor/lib/agent-chat/native-chat-controller.test.ts
  - editor/lib/agent-chat/native-message-parts.test.ts
  - crates/grida-agent/tests/process/file_references.rs
---

## Behavior

A video Chromium can decode (MP4, MOV, WebM, M4V) attaches by reference with a
proper preview: the composer card shows a frame taken half a second in (or
from the middle of a shorter clip), and its type, duration and dimensions. The
preview is read locally from the person's file, with no network, and gives up
after a few seconds. The sent message shows the same frame and caption, and
keeps them after the chat is reopened. A video that cannot be decoded shows
as an ordinary file card. A PNG keeps its existing thumbnail.

## Steps

1. Open Desktop, open a workspace, and focus the native agent composer.
2. From Finder, drop a `.mov` of more than 256 KiB, for example a screen
   recording.
   - Expected: the card shows a frame of the clip and `MOV · 0:12 ·
1920×1080` (its own duration and size). No size-limit message appears.
3. Type "Describe what happens in this clip; use ffprobe." and send.
   - Expected: the sent message shows the frame and caption; the agent
     inspects the clip with a command at its path.
4. Reload the window and reopen the chat.
   - Expected: the sent message still shows the frame and caption.
5. Drop an `.mkv` or a corrupt `.mp4`.
   - Expected: an ordinary file card with no frame; it still attaches.
6. Drop a small PNG.
   - Expected: the PNG thumbnail card, unchanged.
