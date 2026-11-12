---
id: TC-DESKTOP-AGENT-CHAT-016
title: Composer intent selection preserves the draft and starts no work
module: desktop
area: agent-chat
tags: [agent-chat, composer, plan, goal, keyboard, focus]
status: verified
severity: high
date: 2026-11-11
updated: 2026-11-11
automatable: true
covered_by:
  - editor/kits/composer/composer-command-selection.browser.ts
  - editor/lib/agent-chat/native-chat-controller.test.ts
---

## Behavior

Plan and Goal are composer intents. Explicit slash-menu selection adds a
removable badge without sending a message, starting inference, or replacing
the rest of the draft. Keyboard and pointer selection have the same result.
Permissions and effort remain independent. Goal limits are visible before
starting; cancelling customization keeps the unsent intent.

The compact sidebar keeps history and chat actions in its header, with model
selection beside Send. Narrow layouts retain Send and accessible icon controls.
A connection must finish starting before its commands become available.

## Steps

1. Open a native workspace chat and select a configured model. Wait for the
   connection to finish starting. Check that the header contains the chat list,
   title, new-chat button, and options menu, with the model in the composer.
2. Type `Keep this draft /plan` and press Enter on the slash-menu item. The
   Plan badge appears; `Keep this draft` remains editable. No turn starts.
3. Remove Plan, type `/goal`, and click its slash-menu item. Goal appears,
   the slash trigger disappears, and no turn starts.
4. Hover the Goal badge: its icon turns into ×. Click it. Goal disappears and
   no message or model request has been created. There is no goal form.
5. Choose Ultra in the model popover. Planning and permission choices remain
   separate. Open chat history and rename a saved chat through Chat options.
6. Narrow the window. Send, the model picker, the attachment menu, and chat
   actions remain usable. Pending questions and access requests keep their
   own controls when present.

7. Select `/goal`, type an objective and send. The message shows **Sent as
   goal** under it, and hovering it shows its send time with Copy and Edit.
   A strip above the composer reads **Pursuing goal** with the objective,
   elapsed time and clear, pause, and edit buttons. Pause: it reads
   **Paused goal** with a resume button. Edit: the objective opens as text;
   Save changes the strip's objective. Reopen the chat: **Sent as goal**
   remains on the same message.
8. While a turn runs with an empty composer, the single primary button is
   a square Pause. Type text: it becomes Send and queues the message above the
   composer. The queued row offers **Steer**, a trash button and a “…” menu
   with Edit, Move up and Move down. Steer: the row leaves the queue and the
   text appears in the running turn. There is no separate “Send to current
   turn” toggle.
   8a. Pause a running turn with an empty composer. The primary button becomes ▶
   at once, before the pause has settled. Choose ▶ immediately: the same turn
   continues (no new user message), and its new reply streams below anything
   it said before the pause. Pause again, then type and send a message instead: the paused
   turn shows **You stopped** and the new message starts right away,
   ahead of any queued messages, which run after it.
9. Queue three messages while a turn runs. Hover a row: a grip appears at its left; drag the last
   row to the top and the order sticks after the queue refreshes. Choose
   **…** → **Edit**: the row becomes an editable text box; Enter saves,
   Escape cancels. The messages run in the new order. When a queue is held
   with no turn running (for example after a restart), it shows **Queue paused
   because you interrupted** with **Resume**, and the empty composer's primary
   button is ▶.
10. The ring beside the model picker shows context use once the model's window
    is known; hover for the percentage, click for the breakdown. Scrolling the
    chat fades content at the top and bottom edges. No **Execution details**
    panel appears under turns.

## Notes

The real local Electron interaction pass verified steps 1–6 with existing
retained chat content and zero additional model turns. Pending-interaction
semantics retain their separate queue and approval regression obligations.
