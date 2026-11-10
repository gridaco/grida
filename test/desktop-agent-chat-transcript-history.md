---
id: TC-DESKTOP-AGENT-CHAT-011
title: Earlier transcript pages stay separate from current work
module: desktop
area: agent-chat
tags: [chat, history, transcript, recovery]
status: untested
severity: medium
date: 2026-11-10
updated: 2026-11-10
automatable: true
covered_by: [editor/lib/agent-chat/native-chat-controller.test.ts]
---

## Behavior

A long native chat opens at its latest messages. Earlier pages show their own
messages. The current turn summary appears with the latest page. A turn that
finishes while the person browses earlier messages appears on their return to
the latest page.

## Steps

1. Reopen a long native workspace chat whose newest reply is easy to identify.
   Confirm it opens at the latest messages and offers **Earlier messages**.
2. Choose **Earlier messages**. Confirm the earlier replies appear and the
   newest reply and its turn summary are absent from the conversation.
3. Choose **Back to latest**. Confirm the newest reply returns.
4. Send another request in the same chat and open an earlier page while it
   runs. Let the request finish, then choose **Back to latest**. Confirm the
   finished reply appears in the same chat without resending the request.
