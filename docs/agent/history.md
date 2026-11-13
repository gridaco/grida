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

## Reopen or organize a chat

Open the chat list at the top left of the chat pane. It shows every chat in
this workspace, whichever model it used; type to search, or choose **Older
chats** to see more. Choose **New chat** (+) in the pane's header to start
another. Selecting a
chat opens its transcript and saved work. Review any pending question or
interruption before continuing. [Guide and interrupt work](./controls.md)

Long chats open at the latest messages. Scroll up to read earlier messages:
they load above as you go, without moving what you are reading. Reading
earlier messages leaves ongoing work running, and new replies arrive at the
bottom. A message you sent with a file shows the file's name as a chip; the
chip has no image preview.

A new chat gets a short title from its first request while the agent starts
working. To change it, double-click the title, or open **Chat options** (the
three-dot menu) and choose **Rename chat**. Type the new title and press
Enter, or click elsewhere; Escape keeps the old one. A title you set is never
replaced.

**Archive chat** moves a chat out of the active list and lets any ongoing
work continue. Open **Archived chats** to find it again, and choose **Restore
chat** to return it to the active list. When **Delete chat** is available, it
removes the chat's private data and its named subagents. Saved project files
and independent forks stay in place. A chat with running, paused, queued or
uncertain work, or an unfinished goal, cannot be deleted; Desktop explains why
after you confirm.

## Reopen chats after an update

After an update, reopening a chat shows its saved messages and work without
asking the model to repeat anything.

If chat is unavailable after an update, keep your application data in place,
reinstall the current Desktop version, and restore the chat's original model
connection. Deleting data does not reset a connection.

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

Desktop does not offer temporary side chats; ACP clients can open them.
[Ask in a temporary side chat](./clients.md#ask-in-a-temporary-side-chat)

## Continue a long conversation

In an idle chat with nothing queued, send **`/compact`** on its own to
summarize earlier material for future model requests. **Compacting…** shows
while it runs; use the composer's main button to pause it. The transcript
stays in the chat, and a **Conversation compacted** note marks where the
summary took over; open it to read the summary. When earlier conversation
grows large, Grida also compacts it automatically before the next message and
shows **Conversation auto-compacted**.
