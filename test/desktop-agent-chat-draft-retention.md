---
id: TC-DESKTOP-AGENT-CHAT-018
title: The unsent composer state survives everything except removal or an accepted send
module: desktop
area: agent-chat
tags: [chat, composer, draft, reliability]
status: untested
severity: critical
date: 2026-11-12
updated: 2026-11-19
automatable: partial
covered_by:
  [
    editor/lib/agent-chat/composer-drafts.test.ts,
    editor/lib/agent-chat/native-chat-controller.test.ts,
    editor/scaffolds/desktop/workbench/native-chat-recovery.browser.tsx,
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
6. Send from an idle chat, then send a follow-up while the turn runs. On
   confirmation of each send, the matching draft clears even if the transcript
   is still loading. Reload and confirm the composer stays empty.
7. In an idle chat with an empty queue and no unresolved Goal, prepare another
   unsent composer draft. Hover over an earlier plain-text user message and
   choose **Edit and resubmit**. Confirm that message becomes an editor in its
   original position, with Cancel and Send, while the composer keeps its draft.
8. Add several lines with Shift+Enter in the inline editor and choose Cancel. The original
   message returns and the composer draft remains unchanged. Open the same edit
   again, change the text, and press Enter to send (the Send button performs the
   same action). While sending, confirm the inline editor
   cannot change or cancel, and the composer draft is still preserved after the
   replacement appears.
9. With a provider-free fixture that leaves the edit's receipt unconfirmed,
   confirm the inline editor remains reachable with **Retry edit**, even if the
   refreshed transcript already shows the replacement. The replacement text and
   Cancel stay locked; retry checks the same request and preserves the unsent
   composer draft.

## Notes

Attachment bytes are kept on this device only. A model that cannot use the
attachment shows a notice; the attachment is not dropped.

The inline-edit scenarios added on 2026-11-17 have not been manually verified.
