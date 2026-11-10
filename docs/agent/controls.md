---
title: Guide and interrupt agent work
description: Send a correction to the current turn, queue a follow-up, answer a question, or pause and stop work.
keywords: [agent controls, steer, queue, pause, resume, Grida Desktop]
format: md
---

# Guide and interrupt agent work

In a native Desktop workspace chat, use **Send to current turn** when
the running task should change direction. The agent can use that correction
at its next decision. For example, “Keep the first slide and revise the
second one” belongs in the current turn if the agent is still editing the
deck.

## Queue work for later

Send an ordinary follow-up while a turn is running or waiting to put it
in the queue. For example, “When the deck is ready, describe the changes”
can run as its own turn. Each waiting text message keeps the options
selected when you sent it. You can edit, move, or remove eligible queued
messages before they start.

If the current turn asks a question, use its answer control. A separate
queued message leaves the question open. Review an access request through
its approval controls. [Understand agent permissions](./permissions.md)

## Pause or end the current turn

- Choose **Pause** to suspend the current task. Use **Resume** to
  continue it. A retained question or approval can still need your
  answer before work proceeds.
- Choose **Stop** to end the current task and hold the queue. Use
  **Resume queue** when you are ready for the waiting messages to start.

Changes already made can remain in the workspace. Check **Turn summary**
for the outcome, any partial work, and items that need review.
An interrupted provider request can still have incurred a charge. Its final
settlement depends on the provider's recorded result.
[Inspect and save results](./results.md)

## Return to background work

With system notifications enabled, Desktop can tell you when a native
workspace chat finishes or needs access approval while its window is out of
focus. Click the notification to reopen the matching chat on its original model
connection. If a connection is changing or an attachment is still in the
composer, the chat opens after that clears. If the original connection is
unavailable, Desktop reports that before opening the chat.
