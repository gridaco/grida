---
id: TC-DESKTOP-WELCOME-002
title: A Welcome message starts the workspace's first native chat turn exactly once
module: desktop
area: welcome
tags: [welcome, workspace, composer, native-chat, template, model]
status: untested
severity: high
date: 2026-11-13
updated: 2026-11-19
automatable: partial
covered_by:
  [
    editor/lib/desktop/welcome-message.test.ts,
    editor/scaffolds/desktop/home/home-composer.test.ts,
    editor/lib/agent-chat/native-chat-controller.test.ts,
    editor/lib/agent-chat/native-chat-selection-controller.test.ts,
    editor/scaffolds/desktop/workbench/native-permission-mode.browser.tsx,
    editor/scaffolds/desktop/workbench/workspace-canvas-creation.test.ts,
    desktop/src/main/native-chat-ipc.test.ts,
    desktop/src/main/native-desktop-agent.test.ts,
    desktop/src/main/ipc-admission.test.ts,
  ]
---

## Behavior

A message typed on Welcome clears from the composer when Send is pressed.
The composer is immediately ready for the next draft. The first message and
its attachment appear in the workspace chat while it starts, then become its
first turn. The model and effort chosen in the Welcome picker run
that turn; Plan and Goal intents also travel with it. **Default** keeps the
workspace's default connection. On an eligible connection, a response speed
chosen on Home becomes the new chat's speed. Changing the project or model
clears the speed for the previous connection. If the selected speed becomes
unavailable before the first send, the workspace keeps the request for review. A regular first message can use automatic web search when the
destination model and Personalization allow it. Workspace-specific
connections appear after the workspace opens.

The message is sent at most once. It waits while the workspace's chat starts,
however long that takes, and survives a reload before it is sent. Once the
chat sends it, a reload does not send it again. When the chat cannot send it —
the chosen model cannot open, the send fails, or the workspace needs a model
choice first — Desktop keeps the ordinary request available for recovery
alongside any newer draft. If startup is temporarily unavailable, the workspace keeps
the waiting message for **Retry**. Reopening the workspace while a previous
visit is still starting must allow the current visit to finish connecting,
list its existing chats, and send the waiting message once.

New project chats start in **Auto** when the destination supports automatic
review and **Ask for approval** otherwise. This applies both when sending
from Home and when creating a chat inside the project. The access picker can
set **Ask for approval** before the first message. Reopening the chat restores
the saved mode. Older chats that never saved a mode continue to ask for approval.

When Full access is selected on Home, the same confirmation as a workspace
chat appears immediately. Confirming keeps the composer on Home and lets the
person continue drafting. Switching presets for the same project keeps the
approved access in supporting Desktop builds. Changing projects uses the new
project’s default mode. Send opens the exact approved chat with Full access.
Cancel keeps the draft and the previous mode. If copying a selected Slides
template fails, the composer keeps the approval and draft for retry. If the
handoff fails after the chat is prepared, retrying from the same Home composer
with the same model, effort and speed reuses the prepared chat and copied deck.

A picked slides template is copied into the selected destination workspace as
its own deck before the workspace opens. The first message shows the template
as a separate chip and the agent receives the copied deck path and editing
instructions as context. References are listed as links in the first message.
Selecting Slides without a template adds the requested outcome to the first
message. Selecting Images supplies image creation guidance and any selected
Library image links as context. The chat shows Library reference thumbnails
beside the user's words and can start from the picks alone. Selecting Workflows
asks the workspace agent to use Grida FX and follow the `desktop-fx` skill when
available. Picked workflows travel as numbered reference chips outside the
message text. The same selections supply showcase and source links to the
agent as context. Their numbers follow the current
selection order and close any gaps after removal. Sending picks alone starts
a chat with the chips. The agent decides how to use the examples.
The chat keeps its selected model and access. Opening a workspace with an empty
composer starts no turn.

A staged file or image keeps its original File through the same-window route
transition. A reload before consumption retains the request and attachment name,
but cannot recreate the original disk File: the composer asks for reattachment
and refuses to send the text alone. A model that cannot accept the staged
attachment also keeps it with an explanation instead of omitting it.

## Steps

1. On Welcome, type “Make a poster for a jazz night” and send.
   - Expected: Welcome clears the composer and shows no message bubble. The
     message appears once in the new workspace chat while it starts, and the
     agent answers.
2. Reload the window (Cmd+R) after the turn starts.
   - Expected: the same chat is shown; the message is not sent again.
3. Return to Welcome, choose a provider-key model in the picker, type a
   request, and send.
   - Expected: the new chat runs on that model; the workspace's picker shows
     it as the active model.
4. Return to Welcome, pick a slides template, leave the text empty, and send.
   - Expected: a deck named after the template (for example
     `startup-pitch.canvas`, or `startup-pitch 2.canvas` when that exists)
     appears in the workspace. The first message has the template chip and
     the agent edits that copy. Repeat with a typed request and copy the sent
     message. The message bubble and clipboard contain only the typed request.
5. Remove the provider key used in step 3 in Settings, return to Welcome
   (where that model is no longer offered), choose **Default** while signed
   out of Grida with no other provider key, type a request, and send.
   - Expected: the workspace explains the connection problem and keeps the
     request while you retry. Restore the original connection and choose
     **Retry** to send it once. Alternatively, choose a working model. The
     outgoing request offers **Edit** so you can review it and send it explicitly.
6. Send a text-only request from Welcome and reload the workspace window while
   its chat is still starting.
   - Expected: after the reload the chat starts and sends the message once.
7. On Welcome, choose Plan and a non-default effort, attach an image and send.
   - Expected: the workspace sends the original request and attachment once in
     Plan with the chosen effort. A connection that cannot accept the image
     keeps the complete draft with an explanation and sends nothing.
   - Repeat with two images and text. Start typing the next draft while the
     workspace opens. The two images and original text appear on the first
     message. The composer shows only the text typed after Send.
8. Reload while an attachment-bearing request is waiting for startup.
   - Expected: the retained attachment card asks for reattachment. The text is
     kept and no text-only request starts. Remove or reattach the file to proceed.
9. Select Goal on Welcome and send an objective.
   - Expected: the new workspace chat starts it as a goal. An unavailable goal
     capability retains the request and explains the refusal.
10. Choose an existing destination workspace and pick a reference or template.
    - Expected: the request, reference links and any copied deck use that chosen
      workspace rather than switching to the default destination.
11. On Home, type a request and choose Full access.
    - Expected: the Full access dialog appears immediately on Home. Cancel
      keeps the message and the previous mode. Choose Full access again and
      confirm. Home remains open. Select Workflows, then go Back and Forward
      to revisit Home and Workflows. The draft and Full access choice persist.
      Send to open the approved new chat and start the message with Full
      access. No second confirmation appears. Return to Home, approve Full
      access again, and pick a different project. The picker shows the
      destination project’s default mode.
12. On Workflows, click three cards. Hover a composer chip and use a card's
    Open button. Remove reference 2, reselect that card, then remove it again.
    Send “Use the approach from 1 and the layout from 2.”
    - Expected: each chip shows its cover and previews the same media as the
      card on hover. In a narrow window, additional chip rows wrap above the
      first row. The Open button takes you to the public showcase and
      preserves the picks. Removing the second pick moves the remaining
      reference 3 to 2. Reselecting the removed card adds it back as reference 3. The transcript shows your words and separate chips for references 1
      and 2. Copy the message and reload the chat. The clipboard contains
      your words, and the chips return with the same numbers after reload.
13. Return to Workflows, pick Pet, and send with the text field empty.
    - Expected: a regular chat starts with the Pet chip as reference 1. The
      agent receives its FX template ID and can interpret the pick or ask a
      question.
14. On Images, select Library images and send a description. Copy the sent
    message and reload the chat.
    - Expected: the bubble and clipboard contain the description. Click a
      reference thumbnail to open the Library image. The thumbnails return
      after reload, and the agent receives the image creation intent and links.
15. On Images, select one Library image and send with the text field empty.
    - Expected: a regular chat starts with the reference thumbnail.
16. On Images or Workflows, attach a folder or an ordinary file and send with
    the text field empty.
    - Expected: Home asks for a message and keeps the attachment and picks.
      Adding text lets the draft proceed to the workspace.
17. With web search on in Personalization, choose an eligible ChatGPT
    Subscription model and Fast on Home. Ask “Search the web for today’s
    forecast in Seoul.” Repeat in a new workspace chat.
    - Both messages can use hosted search. The speed picker shows Fast in
      the chat started from Home. The **+** menu omits Web search on both
      surfaces. If the agent searches, the chat shows the reported activity.
18. Turn off Web search in Personalization and send the same question with
    the eligible model. Then return to Home and select a model without faster
    speeds.
    - The message can be sent, and the agent has no hosted search tool for
      that request. The new model disables the lightning bolt on Home.
19. Select a project whose host offers Auto. Send a message from Home without
    choosing an access mode. Start another new chat from the project's chat
    pane and send a message there.
    - Both new chats show **Auto**. Reopening either chat restores Auto.
      Repeat with a project whose host omits automatic review and verify
      **Ask for approval**.
20. Save a plain-text fixture outside the project. From Home for the same
    supported project, choose **Ask for approval** and ask the agent to read
    that exact path with its file tool. Decline the request. Reopen this chat,
    create a separate new chat, and open a chat created on an older build that
    never saved a mode.
    - The first turn shows **Allow once** and **Decline** for the exact file.
      Reopening restores **Ask for approval**. The separate new chat starts in
      **Auto**. The older chat shows **Ask for approval**.
21. In a test profile carried over from an earlier build, leave
    `[features].fast_mode = false` in the config and reopen an eligible chat
    that had saved Fast. Open a new chat from Home and another from the project.
    - The saved chat uses **Fast**. Each new draft starts at **Standard** and
      offers the faster speeds supported by its connection. Personalization
      shows **Web search** and **Suggested prompts**.

## Notes

Delivery is owned by `editor/lib/desktop/welcome-message.ts` (window-scoped,
take-once storage) and `NativeChatController.startChat`. Welcome lists choices
through the Welcome-only `grida:welcome:chat-profiles` channel.
