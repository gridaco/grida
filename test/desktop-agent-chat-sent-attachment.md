---
id: TC-DESKTOP-AGENT-CHAT-020
title: A sent attachment shows as a chip in the person's message
module: desktop
area: agent-chat
tags: [agent-chat, image, history]
status: untested
severity: medium
date: 2026-11-13
updated: 2026-11-13
automatable: partial
covered_by:
  - crates/grida-agent/tests/process/images.rs
  - desktop/src/main/native-agent-process.test.ts
  - editor/lib/agent-chat/native-message-parts.test.ts
---

## Behavior

A request sent with a PNG or a file shows the attachment as a named chip above
the request's text, with no placeholder text in the message. The attachment's
bytes stay with the agent; the chat shows only its name. A request with an
attachment cannot be edited and resubmitted, so it offers no Edit action; nor
does a request that started a goal.

## Steps

1. In a native workspace chat on a model that accepts images, attach a PNG
   and send a short request about it.
2. Confirm the sent message shows an `image.png` chip and the request text,
   and no `[Retained PNG image]` text.
3. Reload the window and reopen the chat. Confirm the chip is still shown.
4. Hover the message. Confirm Copy is offered and Edit is not.
5. Hover an earlier plain-text request in the same chat. Confirm Edit is
   offered there.
