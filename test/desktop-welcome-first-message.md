---
id: TC-DESKTOP-WELCOME-002
title: A Welcome message starts the workspace's first native chat turn exactly once
module: desktop
area: welcome
tags: [welcome, workspace, composer, native-chat, template, model]
status: untested
severity: high
date: 2026-11-13
updated: 2026-11-16
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
new native chat there. The model and effort chosen in the Welcome picker run
that turn; Plan and Goal intents also travel with it. **Default** keeps the
workspace's default connection. Welcome offers connections available before a
workspace opens; any workspace-specific choices appear in the workspace's own
picker once its chat is running.

The message is sent at most once. It waits while the workspace's chat starts,
however long that takes, and survives a reload before it is sent. Once the
chat sends it, a reload does not send it again. When the chat cannot send it —
the chosen model cannot open, the send fails, or the workspace needs a model
choice first — the chat says the Welcome message wasn't sent and puts its text
in the composer. When chat cannot open in the workspace at all, the
unavailability notice says the message wasn't sent.

A picked slides template is copied into the selected destination workspace as
its own deck before the workspace opens, and the first message names that copy
so the agent adapts it in place. References are listed as links in the first
message. Selecting Slides or Images makes that requested outcome explicit;
those presets do not change model capabilities or grant additional access.

A staged file or image keeps its original File through the same-window route
transition. A reload before consumption retains the request and attachment name,
but cannot recreate the original disk File: the composer asks for reattachment
and refuses to send the text alone. A model that cannot accept the staged
attachment also keeps it with an explanation instead of omitting it.

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
6. Send a text-only request from Welcome and reload the workspace window while
   its chat is still starting.
   - Expected: after the reload the chat starts and sends the message once.
7. On Welcome, choose Plan and a non-default effort, attach an image and send.
   - Expected: the workspace sends the original request and attachment once in
     Plan with the chosen effort. A connection that cannot accept the image
     keeps the complete draft with an explanation and sends nothing.
8. Reload while an attachment-bearing request is waiting for startup.
   - Expected: the retained attachment card asks for reattachment. The text is
     kept and no text-only request starts. Remove or reattach the file to proceed.
9. Select Goal on Welcome and send an objective.
   - Expected: the new workspace chat starts it as a goal. An unavailable goal
     capability retains the request and explains the refusal.
10. Choose an existing destination workspace and pick a reference or template.
    - Expected: the request, reference links and any copied deck use that chosen
      workspace rather than switching to the default destination.

## Notes

Delivery is owned by `editor/lib/desktop/welcome-message.ts` (window-scoped,
take-once storage) and `NativeChatController.startChat`. Welcome lists choices
through the Welcome-only `grida:welcome:chat-profiles` channel.
