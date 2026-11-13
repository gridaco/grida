---
id: TC-DESKTOP-WELCOME-002
title: A Welcome message starts the workspace's first native chat turn exactly once
module: desktop
area: welcome
tags: [welcome, workspace, composer, native-chat, template, model]
status: untested
severity: high
date: 2026-11-13
updated: 2026-11-13
automatable: partial
covered_by:
  [
    editor/lib/desktop/welcome-message.test.ts,
    editor/lib/agent-chat/native-chat-controller.test.ts,
    editor/scaffolds/desktop/workbench/workspace-canvas-creation.test.ts,
    desktop/src/main/native-chat-ipc.test.ts,
    desktop/src/main/ipc-admission.test.ts,
  ]
---

## Behavior

A message typed on Welcome opens its workspace and becomes the first turn of a
new native chat there. The model chosen in the Welcome picker runs that turn;
**Default** keeps the workspace's default connection. Welcome offers only the
provider-key and saved-endpoint models that exist before a workspace opens;
Grida models other than the default appear in the workspace's own picker once
its chat is running.

The message is sent at most once. It waits while the workspace's chat starts,
however long that takes, and survives a reload before it is sent. Once the
chat sends it, a reload does not send it again. When the chat cannot send it —
the chosen model cannot open, the send fails, or the workspace needs a model
choice first — the chat says the Welcome message wasn't sent and puts its text
in the composer. When chat cannot open in the workspace at all, the
unavailability notice says the message wasn't sent.

A picked slides template is copied into the workspace as its own deck before
the workspace opens, and the first message names that copy so the agent adapts
it in place. References are listed as links in the first message.

## Steps

1. On Welcome, type “Make a poster for a jazz night” and send.
   - Expected: the default workspace opens; a new chat appears with that
     message as its first turn, and the agent answers.
2. Reload the window (Cmd+R) after the turn starts.
   - Expected: the same chat is shown; the message is not sent again.
3. Return to Welcome, choose a provider-key model in the picker, type a
   request, and send.
   - Expected: the new chat runs on that model; the workspace's picker shows
     it as the active model.
4. Return to Welcome, pick a slides template, leave the text empty, and send.
   - Expected: a deck named after the template (for example
     `startup-pitch.canvas`, or `startup-pitch 2.canvas` when that exists)
     appears in the workspace; the first message names it and the agent edits
     that deck.
5. Remove the provider key used in step 3 in Settings, return to Welcome
   (where that model is no longer offered), choose **Default** while signed
   out of Grida with no other provider key, type a request, and send.
   - Expected: the workspace asks for a model, says the Welcome message wasn't
     sent, and the request is in the composer.
6. Send from Welcome and reload the workspace window while its chat is still
   starting.
   - Expected: after the reload the chat starts and sends the message once.

## Notes

Delivery is owned by `editor/lib/desktop/welcome-message.ts` (window-scoped,
take-once storage) and `NativeChatController.startChat`. Welcome lists choices
through the Welcome-only `grida:welcome:chat-profiles` channel.
