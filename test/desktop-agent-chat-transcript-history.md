---
id: TC-DESKTOP-AGENT-CHAT-011
title: Earlier messages load as one continuous scroll
module: desktop
area: agent-chat
tags: [chat, history, transcript, recovery]
status: untested
severity: medium
date: 2026-11-10
updated: 2026-11-12
automatable: true
covered_by: [editor/lib/agent-chat/native-chat-controller.test.ts]
---

## Behavior

A long native chat opens at its latest messages. Scrolling up loads earlier
messages above them as one continuous transcript, without a separate view and
without moving what the person is reading. Current work stays at the bottom.
A turn that finishes while the person reads older messages appears at the
bottom of the same transcript.

## Steps

1. Reopen a long native workspace chat whose newest reply is easy to identify.
   Confirm it opens at the latest messages and shows no paging controls.
2. Scroll up. Before the top is reached, confirm "Loading earlier messages…"
   appears briefly and older messages appear above, while the message you were
   reading stays where it was on screen.
3. Keep scrolling up until the first message. Confirm loading stops and no
   indicator remains at the top.
4. Scroll back down. Confirm the newest reply and its turn summary are still
   there.
5. Send another request, scroll up to older messages while it runs, and let it
   finish. Scroll down and confirm the finished reply appears at the bottom
   without resending the request.
