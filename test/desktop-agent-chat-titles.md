---
id: TC-DESKTOP-AGENT-CHAT-019
title: A new chat is titled from its first request and renames in place
module: desktop
area: agent-chat
tags: [chat, history]
status: untested
severity: medium
date: 2026-11-12
updated: 2026-11-12
automatable: partial
covered_by:
  [
    crates/grida-agent/tests/process/catalog.rs,
    editor/lib/agent-chat/native-chat-controller.test.ts,
  ]
---

## Behavior

A new chat reads **New chat** until the agent titles it from the first
request. The generated title types in over the label so the change is
noticeable. Renaming happens in the header itself, outlined while editing,
with the current title selected. A title the person sets is never replaced.

## Steps

1. Start a new chat. Confirm the header reads **New chat**.
2. Send a first request. Within a few seconds, confirm a short title types in
   over **New chat**, in the request's language. With reduced motion turned on
   in system settings, confirm it appears without the typing effect.
3. Choose **Chat options → Rename chat**. Confirm the title becomes an outlined
   field with the whole title selected. Type a new title and press Enter.
4. Double-click the title. Confirm the same outlined, selected field. Press
   Escape and confirm the title is unchanged.
5. Double-click again, change the title, and click elsewhere. Confirm the new
   title is saved.
6. Send another request. Confirm your title stays.
7. In a chat that still reads **New chat**, open Rename and leave it without
   typing. Confirm it still reads **New chat** and later receives a generated
   title.
