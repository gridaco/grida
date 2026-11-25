---
id: TC-DESKTOP-AGENT-CHAT-032
title: Model connection changes preserve chat history and accepted work
module: desktop
area: agent-chat
tags: [agent-chat, models, providers, history, queue, recovery]
status: untested
severity: high
date: 2026-11-15
updated: 2026-11-25
automatable: false
covered_by:
  - editor/lib/agent-chat/native-chat-controller.test.ts
  - editor/lib/agent-chat/native-chat-selection-controller.test.ts
  - desktop/src/main/native-desktop-agent.test.ts
  - desktop/src/main/native-gateway-api-key.test.ts
  - desktop/src/main/native-workspace-agents.test.ts
  - crates/grida-agent/tests/process.rs
---

## Behavior

An open chat can use an explicitly selected model connection for its next
message, including a different provider or account. Its visible conversation
stays in the same chat. The new connection receives portable conversation
context; accepted work keeps its original model, account and funding.

Desktop saves the future selection independently of starting new work.
On a host that supports a connection per input, a message sent after the
change can join the queue immediately. A change in one chat preserves another
chat's work, its open side chats and its background commands. Refreshing
the model catalogue after a change still lists the other available connections.

Human interaction verification is pending. The adjacent automated cases cover
the underlying transitions and refusals; they do not establish the app's
rendering, focus or interaction behavior.

## Steps

1. Run Desktop with local authentication and two model connections permitted
   for the test. In one chat, finish a short exchange containing a distinctive
   fact. Prepare an unsent follow-up, then select a model on the other
   connection. Confirm the chat identity, earlier messages and draft stay in
   place. Send the follow-up and confirm it uses the selected connection and
   can refer to the earlier fact. Reopen the picker and confirm both
   connections remain listed. Restart Desktop and reopen the same chat;
   viewing its history must not send a new request.
2. On the second connection, start work, queue another message, pause and
   resume the current turn, and let both messages finish. Repeat with Ultra
   and with a Goal that needs more than one turn. Confirm the accepted work
   uses that connection through continuation. While work is running, paused,
   queued or attached to an unfinished Goal, try selecting another
   connection. Confirm the future choice is remembered while accepted work
   keeps its captured route. Send another message immediately. Confirm it
   joins the queue and executes on the new connection, after the previously
   queued message finishes on the original one.
3. Leave another chat in the workspace working, with a side chat open or a
   background command running. From an idle chat, try changing connections.
   Send on the new choice. Confirm the other chat, its side chat and its
   command continue. Try an unavailable connection and confirm the draft
   stays available for retry. On an older host that requires replacing its
   worker, confirm the refusal identifies the blocking work and keeps the draft.
4. With both Grida sign-in and a saved Gateway API key, select the same model
   in each group. Start a signed-in turn that requests a tool approval and
   leave the approval open. Select the API-key connection, send a turn, and
   confirm it appears in the queue. Switch the future choice back to the
   signed-in connection. Remove the saved key while the approval is still
   open. Answer the approval and let the active turn finish. Confirm that the
   queued turn asks for its original connection. Restore that key and
   confirm the queued turn resumes under the API-key connection. Confirm the
   next turn uses Grida sign-in when it is the selected connection.
