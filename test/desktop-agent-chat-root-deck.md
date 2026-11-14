---
id: TC-DESKTOP-AGENT-CHAT-012
title: A registered deck opens its own native chat
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

A deck opened as a workspace has its own saved conversations in the deck
window. Chat readiness and deck editing have separate lifecycles. If chat
cannot start, the deck remains available and its sidebar offers a retry.

## Steps

1. Open a registered `.canvas` deck directly in a build with native deck chat.
   Ask in **Plan** about a file in the deck and wait for the answer.
2. Reopen the deck from Recent. Select the saved chat and verify the answer
   appears alongside the deck without resending the request.
3. Open a different registered deck. Verify it shows its own chats.
4. Open a deck while its configured connection is unavailable. Verify the
   deck still opens and the sidebar displays the chat recovery action.
