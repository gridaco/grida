---
id: TC-DESKTOP-AGENT-CHAT-018
title: The unsent composer state survives everything except removal or an accepted send
module: desktop
area: agent-chat
tags: [chat, composer, draft, reliability]
status: verified
severity: critical
date: 2026-11-12
updated: 2026-11-12
automatable: partial
covered_by:
  [
    editor/lib/agent-chat/composer-drafts.test.ts,
    editor/lib/agent-chat/native-chat-controller.test.ts,
  ]
---

## Behavior

A draft in the native workspace chat composer is kept per chat: its text with
inline file references, Plan or Goal, and an attached PNG or file. Changing the
model or effort, the chat reconnecting, an error, switching chats, reloading
the window or restarting Desktop leave it in place. Removing a part, or a send
the agent accepted, clears it. A failed send keeps it. See the
[draft contract](../docs/wg/ai/agent/experience.md#keep-what-the-person-is-writing).

## Steps

1. Open a workspace chat. Type a multi-line prompt with a file reference,
   select `/plan`, and attach a PNG.
2. Choose another model in the composer. The text, reference, Plan badge and
   attachment remain.
3. Open the chat list, switch to another chat, type something else there, and
   switch back. Each chat shows its own draft.
4. Reload the window (or quit and reopen Desktop) and reopen the chat. The
   draft is still there.
5. Delete all the text, reload: the composer is empty.
6. Type again and send. Once the message appears in the chat, the composer is
   empty and stays empty after a reload.

## Notes

Attachment bytes are kept on this device only. A model that cannot use the
attachment shows a notice; the attachment is not dropped.
