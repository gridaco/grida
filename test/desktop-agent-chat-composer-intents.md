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
4. Open Goal options and Customize goal. Check the initial eight work turns
   and 64 inference steps. Cancel: the dialog closes and Goal remains unsent.
   Remove the intent. No message or model request has been created.
5. Choose Ultra in the model popover. Planning and permission choices remain
   separate. Open chat history and rename a saved chat through Chat options.
6. Narrow the window. Send, the model picker, the attachment menu, and chat
   actions remain usable. Pending questions and access requests keep their
   own controls when present.

## Notes

The real local Electron interaction pass verified steps 1–6 with existing
retained chat content and zero additional model turns. Pending-interaction
semantics retain their separate queue and approval regression obligations.
