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

## Start from Home

Home and workspace chats share the composer, its **+** menu, removable **Plan**
and **Goal** badges, and model and effort picker. Available actions depend on
what your installed Desktop and selected connection support. Home has no running
turn or waiting queue to control.

Choose the destination workspace on Home, write a request, and send. The
workspace opens with a new chat using the model, effort and intents you chose.
Drop an image, file or folder anywhere on Home to stage it in the composer;
the shared **Drop to attach** overlay covers the whole Home window.
An attached image or file travels with the request. If the connection cannot
accept it, Grida keeps the attachment and request in the composer for you to
resolve; it does not send the text alone. Reloading before that first send can
lose the original selected file. Its card then asks you to attach it again;
remove or replace it before sending.

Home also offers reference galleries and slide templates. References become
links in the first message. A template is copied into the destination workspace,
and the message identifies the copy to adapt. **Slides** and **Images** describe
the requested outcome; they do not change the agent's permissions or make an
unsupported tool available.

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
turn. It appears above the composer while its details load. After the current
turn finishes normally, the next waiting message starts automatically when
there is room to run it. Each waiting message keeps the options you selected
when you sent it. The row shows a **Plan** or **Ultra** choice. The model
selection stays in the message's saved settings.

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

## Reconnect to a chat

If a saved chat loses live updates, Desktop tries to restore them. While it is
disconnected, you can still read the saved messages already on screen and keep
writing your draft. Choose **Reconnect** if the automatic attempt ends. This
restores the view of the same chat without sending a message or starting its queue.

If a message was awaiting confirmation, retry that same draft to check whether
it was already accepted. Desktop uses the original send identity so checking
doesn't create a second turn.

If the agent process ended during a turn, the chat can show that the turn was
interrupted. Review any partial work, then choose **End interrupted turn** to
settle it, or **Finish ending turn** if it was already stopping. This keeps
the work and any unresolved effects on record. You can then send a new message
in the same chat. If the queue is held, choose **Resume queue** when you're
ready for waiting messages to start.

## Stop running processes

A command the agent starts can keep running after its turn, such as a
development server or a watcher. The composer has no process badge.

In a workspace, the bottom **Workspace utilities** panel has **Terminal** and
**Processes** tabs. **Processes** shows the selected parent chat's agent
processes with the same list and Stop controls, including ended entries when
none are running. The **Terminal** tab keeps your separate interactive shell;
**Processes** does not show a live terminal output stream. Switching tabs or
closing the panel does not stop the agent's processes.

Type `/stop` on its own, or choose **stop** in the `/` menu, to stop every
process of the chat without sending a message. It does not stop the current
turn; use the composer's main button for that.

Switching chats or reloading the window leaves the processes running, and the
list returns when the chat reopens. Closing the window that shows the chat
stops them, unless another open window also shows that chat. Deleting the
chat or quitting Desktop stops them too. Use `/stop` in a side chat to stop
its own processes. The workspace's Processes tab follows the selected main chat.

## Follow a subagent's work

Click a subagent indicator or named start/finish event in the parent
transcript. In a workspace, **Subagents** opens as a main content tab. Select
a child to read its status, recorded activity and conversation. The parent composer remains
usable. Closing the tab only hides the view, and another indicator click
opens it again. This view offers no creation, assignment or execution
controls; give further instructions in the parent chat. Agent process
controls live separately in the workspace's **Processes** tab.
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
