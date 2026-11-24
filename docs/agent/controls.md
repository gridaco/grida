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

**Steer** addresses the running turn you see. An eligible image or file
reference goes with the message. Steered images can be previewed alongside
the turn's other activity, including after reopening the chat. If the turn
finishes or cannot accept the message, the action leaves it in the queue.
A message queued with **Plan**, **Ultra**, or a new **Goal** keeps its own turn.
Steering an active Plan keeps it read-only, and steering a Goal leaves its
objective in place.

## Queue work for later

Send an ordinary follow-up while a turn is running to put it in the queue. For
example, “When the deck is ready, describe the changes” can run as its own
turn. Each press of Send shows a row in the queue above the composer, even
if several messages have identical text. Queue actions appear as Grida confirms each row. After the current
turn finishes normally, the next waiting message starts automatically when
there is room to run it. Each waiting message keeps the options you selected
when you sent it. The row shows a **Plan** or **Ultra** choice. The model
selection stays in the message's saved settings.

Hover or focus a waiting message to read its full text, including line breaks.
Every message keeps its queue icon. An attached image also shows a leading
thumbnail when its preview is available.
Opening this preview leaves the message in the queue and does not edit it.

Before a waiting message starts, drag it, or open its **…** menu and choose
**Move up** or **Move down**, to reorder it. Choose **…** → **Edit** to
take that message out of the runnable queue and open it in the composer.
Other waiting messages can run while you edit. Add or remove attachment cards
in the same composer. **Send** or Enter returns the revised message
to its reserved position among the remaining items with its captured settings.

Escape restores the original message. **⌘Z** undoes edits and,
at the start of the edit's history, also restores the original to the queue.
Your ordinary draft, attachments, and selected modes come back when editing
ends. If confirmation is interrupted, use **Retry** to check the outcome.
When you reopen a chat with an unfinished edit, choose **Continue editing**
or **Restore original**. A queued Goal can be removed and sent again with a
revised objective.

Press ↑ in an empty composer to open the most recent waiting message when
it is editable. Use **Send** to return your revision or Escape to restore the
original.

When the queue is empty, ↑ recalls a sent prompt. If you already staged a file,
↑ copies only the text from the waiting or sent message into the current draft.
If that message contains only an attachment, ↑ leaves the draft as it is.
While the field contains text, ↑ and ↓ move the caret as usual.
Use **⌘Z** to undo a recall. Undo and redo also work
after Send and for changes to a staged file in a text-free draft.

If the current turn asks a question, answer it in its card. Use Shift+Enter
to add a line in a custom answer. For a set of questions, use the arrows around
the question counter to go back or forward. Selecting an option advances to
the next question when there is one. **Next** keeps your answer and skips the
question if it is blank. In a set, **Skip** and the close button skip the
current question even if it has an answer. On the last question, use **Submit**,
double-click an option to submit it, or use **Skip** to submit with that
question skipped. If earlier questions are still unanswered, you can go back
or confirm skipping them.

A required question or set waits for your submission. An optional question or
set lets the agent keep working.
A required single question’s close button skips it. Use the close button to put
a single optional question away, or press Escape to put an optional set away.
The chat shows an **Answer question** or **Answer questions** button while the
request is open. The agent gives you time to reply before proceeding on a
stated assumption. The card expires when
the turn ends. A separate queued message leaves the questions open.

Your answers appear with their questions. Open **Worked for …** on a finished
turn to read the exchange again.

## Compact context

Send `/compact` in an idle chat with an open, empty queue to summarize earlier
model context. The command clears as it is sent. The transcript shows
**Compacting context**, then the result. Once compaction starts, you can send
a follow-up and it waits in the queue. The original conversation stays in the
transcript.

If the chat cannot confirm the start, **Retry compaction** checks the same
request while preserving your next draft.

## Pause, resume, or move on

While the agent works, the composer's main button (■) pauses it at once and
keeps its place. With focus in the composer and the square button visible,
press Escape to show **Esc** on the button. Press it again within two seconds
to pause. A reply in progress is cut off. Completed tool work is kept.

From there:

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

For an ordinary message awaiting confirmation, choose **Retry** on the
outgoing message. Desktop checks its original send identity. You can keep
typing while it checks. Once that send is accounted for, you can send the
next draft. A confirmed refusal also offers **Edit** to restore the message
into an empty composer, or **Dismiss** to continue with your current draft.

When a send with attachments is accepted, reopening the chat shows that
message in the transcript or queue and restores any newer unsent draft.

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
finishes, fails or ends with an uncertain result while you’re away from that
chat. This includes viewing another chat in the same project. When a turn
succeeds, the notification shows the chat title and a short
excerpt from the final reply. If the chat has no title, it shows **Grida
Agent**. If the reply has no preview text, it shows **Turn completed**.

Automatic compaction stays silent in system notifications. The following
reply can still notify you. When you run `/compact` yourself, Desktop can
notify you when it finishes.

When a question arrives in another chat or side tab, the notification shows
its chat title and question. The system’s notification settings control where
previews appear. A question in the chat already on screen appears in its card.
A turn you stopped is silent.

Click the notification to reopen the matching chat on its original model. If
the model is changing or an attachment is still in the composer, the chat
opens after that clears. If the original model is unavailable, Desktop says so
before opening the chat. If the workspace chat is still starting, Desktop
opens the latest clicked notification once the chat connects. A side-chat notification
returns to the tab in the window that opened it, while that side chat is still open.
