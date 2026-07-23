---
id: TC-DESKTOP-CHAT-001
title: Chat history and inline title editing have separate controls
module: desktop
area: chat
tags: [chat, history, title, rename, session]
status: untested
severity: medium
date: 2026-07-23
updated: 2026-07-23
automatable: false
covered_by: []
---

## Behavior

The active chat title identifies the conversation; it does not also act as the
history menu. A dedicated list button opens chat history, while the title
supports direct inline renaming. Both the title's double-click gesture and the
overflow menu's Rename action enter the same editor, avoiding a second dialog
interaction.

Before a session has started, the title reads **New Task**. Once a saved session
is active, its own title replaces that fallback.

Renaming a chat from a history row first makes that chat current, then edits
the title in the header. Enter or leaving the field commits a non-empty changed
title; Escape cancels it.

## Steps

1. Open a pristine new chat.
   - Expected: the header title reads **New Task**.
2. Open a workspace with at least two saved chat sessions.
   - Expected: a list icon button appears immediately before the active chat
     title, and the title has no chevron or dropdown affordance.
3. Move the pointer over the title without clicking.
   - Expected: the chat list does not open.
4. Activate the list button.
   - Expected: the recent chat list opens.
5. Close the list, then double-click the active title.
   - Expected: the title becomes an inline text field with its text selected;
     its size, weight, color, and position match the read-state title, with no
     generic input border or shadow. No dialog appears.
6. Type a new title and press Enter.
   - Expected: the inline field closes and the renamed title remains visible.
7. Open the active chat's overflow menu and choose Rename.
   - Expected: the same inline title field opens. Pressing Escape restores the
     existing title without renaming it.
8. Open the chat list, use a different row's overflow menu, and choose Rename.
   - Expected: that chat becomes active and its title opens in the header editor.
