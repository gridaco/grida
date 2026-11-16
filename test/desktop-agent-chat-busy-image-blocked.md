---
id: TC-DESKTOP-AGENT-CHAT-005
title: A message with an attachment queues together while the chat is busy
module: desktop
area: agent-chat
tags: [agent-chat, composer, attachment, image, queue, multimodal]
status: untested
severity: medium
date: 2026-06-07
updated: 2026-11-13
automatable: false
covered_by:
  - editor/lib/agent-chat/native-chat-controller.test.ts
  - desktop/src/main/native-agent-images.test.ts
---

## Behavior

Sending while the chat is working queues the message. A message with one PNG
or one file queues with its attachment: the queued entry keeps the text and the
attachment together, and when it runs the agent receives both in the same
message. An unconfirmed queued send keeps the draft and its attachment so the
person can retry it without creating a second message.

## Steps

1. Open Desktop, open a workspace, and focus the native agent composer.
2. Send a prompt that keeps the agent working for a while.
3. While it works, attach a PNG of at most 256 KiB, type "Describe this
   image", and send.
   - Expected: the composer clears and the message appears in the queue.
4. Let the running turn finish, or choose **Resume queue** if the queue is
   held.
   - Expected: the queued message runs and the reply describes the image.

## Notes

- The previous chat blocked attachment sends while busy because its queue held
  text only. Native chat queues the attachment with its text.
- The controller test covers an attached file keeping its input identity
  through an unconfirmed queued send; the Main test queues a PNG with its
  text.
