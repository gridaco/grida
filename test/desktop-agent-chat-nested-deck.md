---
id: TC-DESKTOP-AGENT-CHAT-014
title: A nested deck keeps its own chat in the file window
module: desktop
area: agent-chat
tags: [chat, deck, canvas, workspace]
status: untested
severity: medium
date: 2026-11-10
updated: 2026-11-10
automatable: true
covered_by: [desktop/src/main/native-chat-ipc.test.ts]
---

## Behavior

A deck opened in its file window from inside a project has its own saved
chats. Its agent can work with files in the deck. The rest of the project is
available in the workbench chat with that project's access.

## Steps

1. In a Desktop build with native deck chat, open a project with two `.canvas`
   bundles. Open the first bundle in its file window.
2. In **Plan**, ask about a known file inside the deck and a known file beside
   it. Verify the answer uses the deck file and the other file is unavailable.
3. Reopen or restore the deck window. Choose the saved chat and verify the
   answer appears without resending the request.
4. Open the other bundle and the project workbench. Verify neither lists the
   first deck's chat.
