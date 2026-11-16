---
title: Guide and interrupt agent work
description: Steer the current turn, queue a follow-up, answer a question, pause and move on, or stop the chat's running processes.
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

Hover or focus a waiting message to read its full text, including line breaks.
Every message keeps its queue icon. An attached image also shows a leading
thumbnail when its preview is available.
Opening this preview leaves the message in the queue and does not edit it.

Before a waiting message starts, drag it, or open its **…** menu and choose
**Move up** or **Move down**, to reorder it. Choose **…** → **Edit** to load its
text into the main composer. The message stays queued and is marked **Editing**.
Choose **Save changes** or press Enter to replace its text; its other options
stay the same. **Cancel** or Escape leaves it unchanged. Your unsent draft,
attachments and selected modes return when editing ends. If saving fails, your
edit stays in the composer to retry. Steering is unavailable while the composer
holds an edit. On a supported Desktop runtime, messages with images or files
can also be edited: only their text changes, and you can clear the caption
while keeping the attachment. The attached content, captured settings and queue
position stay the same. Older runtimes offer editing for plain text only.
Goals cannot be edited; remove the queued goal and send a new one instead.

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

## Stop running processes

A command the agent starts can keep running after its turn, such as a
development server or a watcher. While any of the chat's processes runs, the
composer toolbar shows **N running**. Open it to see each process's command,
its folder and whether it is running or ended. Choose **Stop** on one process,
or **Stop all**.

The chat's activity view also has **Processes**. It keeps the host's ended
entries reachable when no process is running and uses the same list and Stop
controls. It does not show a live terminal output stream. Closing the view
does not stop processes.

Type `/stop` on its own, or choose **stop** in the `/` menu, to stop every
process of the chat without sending a message. It does not stop the current
turn; use the composer's main button for that.

Switching chats or reloading the window leaves the processes running, and the
list returns when the chat reopens. Closing the window that shows the chat
stops them, unless another open window also shows that chat. Deleting the
chat or quitting Desktop stops them too. A side chat lists and stops its own
processes the same way; they end when it closes.

## Control a subagent's work

Open **Subagents** in the chat's activity controls, then select a child.
Available controls apply to that child's observed assignment or waiting queue:
Pause and Resume continue the same assignment; Steer adds a correction; Stop
ends the current assignment and holds its queue. Resume Queue starts waiting
work, and a waiting assignment can be withdrawn. A message supplies context
for the next assignment without starting idle work.

These controls appear only when the connection supports them and the current
observation permits the action. They do not replace the parent chat's Stop or
the separate process controls. Closing the child viewer is observational.
[Work with subagents](./subagents.md)

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
