---
id: TC-DESKTOP-AGENT-CHAT-032
title: Model connection changes preserve chat history and accepted work
module: desktop
area: agent-chat
tags: [agent-chat, models, providers, history, queue, recovery]
status: untested
severity: high
date: 2026-11-15
updated: 2026-11-16
automatable: false
covered_by:
  - editor/lib/agent-chat/native-chat-controller.test.ts
  - desktop/src/main/native-desktop-agent.test.ts
  - desktop/src/main/native-workspace-agents.test.ts
  - crates/grida-agent/tests/process.rs
---

## Behavior

An idle chat can use an explicitly selected model connection for its next
message, including a different provider or account. Its visible conversation
stays in the same chat. The new connection receives portable conversation
context; accepted work keeps its original model, account and funding.

Desktop saves the future selection independently of activating its connection.
If sending needs a shared-worker replacement, a refusal explains the work to
resolve and preserves the requested choice and unsent message. A change in one chat cannot silently stop another
chat's work, discard a side chat or end its background commands. Refreshing
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
   keeps its captured route. Try sending on that choice: any required worker
   replacement explains the actual blocker and preserves the draft. Resolve
   the work and confirm the saved choice then executes.
3. Leave another chat in the workspace working, with a side chat open or a
   background command running. From an idle chat, try changing connections.
   Try sending on the new choice. Confirm any required worker replacement is
   refused without interrupting
   the other chat, closing the side chat or stopping the command. Also try a
   connection that fails to start, and, using a controlled host fixture, an
   unsupported older host. Confirm a clear error and preserved selection and
   draft. Restore the connection and retry successfully.
