---
title: Return to work and manage chat history
description: Reopen, rename, archive, branch, revise or compact a saved workspace chat in Grida Desktop.
keywords: [agent chat history, Grida Desktop, branch chat, compact context]
format: md
---

# Return to work and manage chat history

Available in Grida Desktop on macOS and Linux. Clients can fork, compact and
revise chats through the
[client guide](./clients.md#branch-or-revise-a-chat).

Each saved chat keeps its own model connection and effort. Opening it restores
that pair without changing the preference used by the next new chat. A fork
starts with the source chat's selected pair and remembers later changes
independently. Retained running or queued work keeps its accepted settings.
If an older chat's original connection cannot be verified, choose one
explicitly; Grida does not borrow a different chat's current composer choice.

## Reopen or organize a chat

Open the chat list at the top left of the chat pane. It shows every chat in
this workspace, whichever model it used; type to search, or choose **Older
chats** to see more. Choose **New chat** (+) in the pane's header to open a
blank draft; the chat is created when you send its first message. Selecting a
chat opens its transcript and saved work. Review any pending question or
interruption before continuing. [Guide and interrupt work](./controls.md)

On compatible Desktop builds, a spinner beside a chat means its turn is
running. You can switch to another chat and reopen the list to check on the
first one. The list refreshes while open, and the spinner clears when the
turn pauses or finishes. Older builds show the list without running indicators.

On compatible Desktop builds, the chat list and **Settings → Archived chats**
show the date of the latest turn's activity. This is its finish time, or its
start time while unfinished, including stopped or failed work. Hover the date
for the full local date and time. Renaming, archiving and reopening a chat do
not change it. Chats without a recorded turn and older Desktop builds show no
date.

Long chats open at the latest messages. Scroll up to read earlier messages:
they load above as you go, without moving what you are reading. Reading
earlier messages leaves ongoing work running, and new replies arrive at the
bottom. Attachments appear outside the message's text bubble. A supported
image shows just the image, without a card frame or caption; other files keep
individual cards. Supported images and retained video poster frames offer a
preview after you reopen the chat. An older Desktop build without retained
image support keeps the file card. An unavailable retained image shows an
unavailable notice.
[Inspect attachments](./results.md#inspect-an-attachment)

An empty draft shows **New chat**. If your first message contains text, its
opening words appear in the header and workspace chat picker as soon as the
host accepts it. The agent can replace this excerpt with a generated title.
If generation fails, the excerpt stays, including when you reopen the chat.
A rejected send leaves the draft untitled.

To choose your own title, double-click the title or open **Chat options** and
choose **Rename chat**. Press Enter or click elsewhere to save, or press Escape
to cancel. Your saved title takes precedence even if the agent is still
generating one.

**Archive chat** moves a chat out of the active list and lets any ongoing
work continue. After confirmation, Desktop opens a new-chat draft and shows
**Chat archived**. Open **Settings → Archived chats** to find archived chats across
your workspaces, then choose **Unarchive** to return one to its workspace's
active list. Restoring a chat does not open it or resume its work, and does not
require a working model connection. The chat picker shows active chats only.
When **Delete chat** is available, it
removes the chat's private data and its named subagents. Saved project files
and independent forks stay in place. A chat with running, paused, queued or
uncertain work, or an unfinished goal, cannot be deleted; Desktop explains why
after you confirm.

## Reopen chats after an update

After an update, reopening a chat shows its saved messages and work without
asking the model to repeat anything.

If chat is unavailable after an update, keep your application data in place,
reinstall the current Desktop version, and restore the connection used by any
unfinished work. A settled chat can use an explicitly selected model
connection for its next message while keeping its visible history. Deleting
data does not reset a connection.
[Choose a model](./models-and-usage.md#choose-a-model)

## Try a different direction

- Send **`/fork`** on its own to make a separate chat from the latest saved
  message. Choose **Open fork** to switch; the original chat can keep working.
  Both chats work on the same project files.
- Hover an earlier message you sent and choose **Edit and resubmit** to
  revise the conversation from that point. The panel shows how many later
  messages the edit replaces; choose **Resubmit** to send it. The chat must be
  idle, with no waiting or paused messages and no unfinished goal. Editing is
  not available on a message that included an attachment or started a goal.
  Earlier file changes stay in their files; undo them in the file's editor.

## Ask a side question

To ask about the conversation without adding to it, type **`/side`** in a
chat and send it, or choose **side** from the **`/`** menu. A temporary side
chat opens right away as a **Side chat** tab beside your open files (in a file
window, under the chat) with its message box ready, and this chat does not
change. Send **`/side`** followed by a question to open a new side chat and
ask it in one step. Each **`/side`** with a question opens another side chat
in its own tab, so you can keep several side questions apart. **`/side`** on
its own brings forward the side chat you used last, or opens one if none is
open.

A side chat starts empty. It knows this chat's saved conversation, but shows
only its own messages, and continues as its own chat with the same model and
effort. After your first message, the side chat gets a title the same way a
new chat does, and its tab shows that title instead of **Side chat**. Hovering
its tab shows the latest visible messages from you and Grida without selecting
the tab or starting work. It works like any chat: replies stream in, and you
can queue, steer, pause or
stop it, answer its questions and approvals, use **Plan**, edit a message you
sent there, and see its background processes. Ask as many follow-up questions
as you like in the tab. It treats this chat's conversation as background: it
answers your questions and can look through the project with the same tools
and permissions as this chat, and it asks for approval in the same places. It
does not pick up this chat's unfinished work, and it avoids changing files or
settings unless you ask it to after opening it. When the conversation is long,
the side chat summarizes it automatically before your first question and keeps
treating the summary as background. Goals, scheduled follow-ups, subagents,
**Ultra** effort, **`/fork`**, **`/compact`**, another **`/side`**, choosing
another model, renaming and archiving are not available in a side chat, and
its message box does not offer them.

A chat can have up to eight side chats open. When that many are open, this
chat says so; close one to open another. In a file window, the latest side
chat shows under the chat, and closing it shows the one before it.

A side chat never appears in your chat list, and neither does its title. It is
discarded with its conversation, attachments and background processes when you
close its tab or choose **Close side chat**; closing one side chat leaves the
others open. Switching to another chat, deleting this chat, closing the window
or quitting discards all of them. A closed side chat cannot be reopened.
Opening one leaves this chat's **Plan** and draft settings as they were. ACP
clients can open side chats too.
[Ask in a temporary side chat](./clients.md#ask-in-a-temporary-side-chat)

## Continue a long conversation

In an idle chat with nothing queued, send **`/compact`** on its own to
summarize earlier material for future model requests. **Compacting…** shows
while it runs; use the composer's main button to pause it. The transcript
stays in the chat, and a **Conversation compacted** note marks where the
summary took over; open it to read the summary. When earlier conversation
grows large, Grida also compacts it automatically before the next message and
shows **Conversation auto-compacted**.
