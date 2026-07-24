---
id: TC-DESKTOP-CHAT-002
title: Chat history row actions remain interactive
module: desktop
area: chat
tags: [chat, history, menu, pointer, delete]
status: verified
severity: medium
date: 2026-07-24
updated: 2026-07-24
automatable: true
covered_by: []
---

## Behavior

Each saved chat row has its own actions menu inside the larger chat-history
popover. Moving the pointer from a row's overflow button, across the intervening
row or overlay gap, and into the portaled actions menu must not dismiss either
surface or select the history row. The actions menu stays open and every action
remains clickable without switching conversations.

## Steps

1. Open a workspace with at least two saved chat sessions.
2. Open the chat-history menu.
3. Activate a non-current row's overflow button.
   - Expected: the Rename, Copy session ID, and Delete actions appear while the
     chat-history menu remains open.
4. Move the pointer over each action without clicking.
   - Expected: the actions menu remains visible and the active chat does not
     change.
5. Click Delete.
   - Expected: the actions menu closes and the Delete chat confirmation dialog
     opens for that row. The row is not selected and no chat is deleted before
     confirmation.

## Notes

- 2026-07-24: An instantaneous locator hover passed while a 30-step pointer
  path reproduced the dismissal. The history surface was a Radix menu whose
  `menuitem` contained a second independent menu root; pointer travel refocused
  the outer item and dismissed the inner menu.
- 2026-07-24: Verified in local Grida Desktop with 30-step pointer movement
  from the overflow trigger through the gap to Rename. A second stepped move
  followed by mouse down/up on Delete opened the confirmation dialog without
  deleting data.
