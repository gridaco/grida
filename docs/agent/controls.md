---
title: Guide and interrupt agent work
description: Steer the current turn, queue a follow-up, answer a question, or pause and move on.
keywords: [agent controls, steer, queue, pause, resume, Grida Desktop]
format: md
---

# Guide and interrupt agent work

Available in Grida Desktop chat on macOS and Linux. Headless and ACP clients
pause, steer and queue through the
[client operations](./clients.md#use-durable-client-operations).

## Steer the current turn

Send your message while the agent is working. It joins the queue above the
composer. When shown, choose **Steer** on that queued message to have the
running turn change direction instead of waiting; the agent uses the
correction at its next decision. For example, “Keep the first slide and revise
the second one” belongs in the current turn if the agent is still editing the
deck.

**Steer** is not offered for a message queued with **Plan**, with **Ultra**
effort, as a goal, or with an attachment; those wait for their own turn. If
the turn ends before your correction arrives, its text returns to the
composer as an unsent draft.

## Queue work for later

Send an ordinary follow-up while a turn is running to put it in the queue. For
example, “When the deck is ready, describe the changes” can run as its own
turn. Each waiting message keeps the options selected when you sent it; a
**Plan** or **Ultra** choice is shown on the message, but its model is not.

Before a waiting message starts, drag it, or open its **…** menu and choose
**Move up** or **Move down**, to reorder it. Choose **…** → **Edit** to change
its text in place, or remove it. Editing changes only the text and keeps the
other options. A goal or a message with an attachment cannot be edited; remove
it and send a new one instead.

If the current turn asks a question, answer it in its card. A separate queued
message leaves the question open.

## Pause, resume, or move on

While the agent works, the composer's main button (■) pauses it at once and
keeps its place. A reply in progress is cut off; tool work already completed
is kept. From there:

- Choose ▶ in the empty composer to resume the same turn where it paused.
  Completed work is kept; a reply that was cut off is written again.
- Or send a new message. The paused turn ends as stopped, and your message
  runs next, ahead of anything already waiting. Waiting messages follow it.

A turn paused from another client also shows ▶ here. If you paused a goal from
its strip, choose **Resume goal** on that strip instead.
[Keep an objective across turns](./effort-and-goals.md#keep-an-objective-across-turns)

If waiting messages are held after a turn ends, the queue shows
**Queue paused because you interrupted** with **Resume**. After a full
Desktop restart, reopening a chat only loads its saved work; if messages are
waiting, choose **Resume queue** to start them.

Changes already made stay in the workspace. A stopped turn keeps its partial
work in view under **You stopped**. An interrupted model request may still be
charged; check your provider's billing record.
[Inspect and save results](./results.md)

## When a turn ends on its own

A turn that fails shows **Failed after …**. A turn whose outcome Grida could
not confirm shows **Worked for … · result uncertain**; this happens, for
example, when the model sends a tool request Grida cannot read, and the turn
ends instead of letting the model try again. Work already done stays in the
workspace. Review it, then send a new message to continue.

## Return to background work

With system notifications turned on, Desktop tells you when a workspace chat
finishes, fails or ends with an uncertain result while its window is out of
focus. A turn you stopped does not notify, and neither does a question from
the agent, so check a backgrounded chat when you expect it to ask something.

Click the notification to reopen the matching chat on its original model. If
the model is changing or an attachment is still in the composer, the chat
opens after that clears. If the original model is unavailable, Desktop says so
before opening the chat. If the workspace chat is still starting, Desktop
opens the latest clicked notification once the chat connects.
