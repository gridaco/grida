---
title: Guide and interrupt agent work
description: Send a correction to the current turn, queue a follow-up, answer a question, or pause and stop work.
keywords: [agent controls, steer, queue, pause, resume, Grida Desktop]
format: md
---

# Guide and interrupt agent work

In a native Desktop workspace chat, send your message while the agent is
working. It joins the queue above the composer. Choose **Steer** on that queued
message when the running task should change direction instead of waiting. The
agent uses that correction at its next decision. Messages sent with **Plan**,
**Ultra**, a goal or settings permission, and messages with an attachment, wait
for their own turn and cannot be steered. If the turn cannot take a steered
message, its text returns to the composer as an unsent draft. For example, “Keep the first slide and revise the
second one” belongs in the current turn if the agent is still editing the
deck.

## Queue work for later

Send an ordinary follow-up while a turn is running or waiting to put it
in the queue. For example, “When the deck is ready, describe the changes”
can run as its own turn. Each waiting text message keeps the options
selected when you sent it; a **Plan** or **Ultra** choice is shown on the
message, but its model is not. Before they start, drag a waiting message to
reorder it, choose **…** → **Edit** to change its text in place, or remove it.
Editing changes only the text and keeps the captured options. A goal, a message
with settings permission, or a message with an attachment cannot be edited;
remove it and send a new one instead.

If the current turn asks a question, use its answer control. A separate
queued message leaves the question open. Review an access request through
its approval controls. [Understand agent permissions](./permissions.md)

## Pause, resume, or move on

While the agent works, the composer's main button pauses it at once and keeps
its place. A reply in progress is cut off; tool work already completed is kept.
From there:

- Choose ▶ in the empty composer to **Resume** the same turn where it paused.
  Completed work is kept; a reply that was cut off is written again.
- Or send a new message. The paused turn ends as stopped, and your message
  runs next, ahead of anything already waiting. Waiting messages follow it.

Like a music player: pause, then play to continue the same track, or pick
the next one. A turn paused by a Goal or another client also shows ▶.

If waiting messages are held after a turn ends, the queue shows
**Queue paused because you interrupted** with **Resume**.

After a full Desktop restart, reopening a chat only loads its retained work.
If messages are waiting in an idle queue, choose **Resume** to start them.

Changes already made can remain in the workspace. A stopped turn keeps its
partial work in view under **You stopped**.
An interrupted provider request can still have incurred a charge. Its final
settlement depends on the provider's recorded result.
[Inspect and save results](./results.md)

## Return to background work

With system notifications enabled, Desktop can tell you when a native
workspace chat finishes, fails, ends with an uncertain result, or needs access
approval while its window is out of focus. A turn you stopped does not notify.
A question from the agent does not notify either, so check a backgrounded chat
when you expect it to ask something. Click the notification to reopen the matching chat on its original model
connection. If a connection is changing or an attachment is still in the
composer, the chat opens after that clears. If the original connection is
unavailable, Desktop reports that before opening the chat.
If the workspace chat is still starting, Desktop keeps the latest clicked
notification until the chat connects. A workspace disconnect during delivery
discards that target.
