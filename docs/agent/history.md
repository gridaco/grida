---
title: Return to work and manage chat history
description: Reopen, archive, branch, or revise a saved workspace chat in Grida Desktop.
keywords: [agent chat history, Grida Desktop, branch chat, compact context]
format: md
---

# Return to work and manage chat history

## Reopen or organize a chat

In a native workspace chat, open the chat list at the top left to reopen a conversation.
Its transcript and retained work are available in the original chat. Review any
pending question, approval, or interruption before continuing.
[Guide and interrupt work](./controls.md)

Long chats open at the latest messages. Scroll up to read earlier messages:
they load above as you go, without moving what you are reading. Reading
earlier messages leaves ongoing work running, and new replies arrive at the
bottom.

A new chat gets a short title from its first request while the agent starts
working. To change it, double-click the title, or open **Chat options** (the
three-dot menu) and choose **Rename chat**. Type the new title and press
Enter, or click elsewhere; Escape keeps the old one. A title you set is never
replaced. **Archive chat** moves it out of the
active list and lets any ongoing work continue. Open **Archived chats** to find
it again or choose **Restore chat** to return it to the active list. When
**Delete chat** is available, it removes the chat’s private data and its named
subagents. Saved project files and independent forks stay in place. A chat
with running, paused, queued or uncertain work, or an unfinished goal, cannot
be deleted; Desktop explains why after you confirm.

## Find your previous chat archive

Updating Desktop keeps your chats; select a saved chat to read it again, and
reopening it does not ask the model to repeat the work. Chats from earlier
Desktop versions stay in their original storage and are not listed in the chat
selector. This does not create an archive or prevent an older installation from
changing its own data.

If chat is unavailable after an update, restore the current build and the
chat's original model connection. Keep the application data and previous chat
files in place while recovering; deleting them is not a connection reset.

If your installation completed a verified archival handoff, choose **File →
Show Previous Chat Archive** to find the saved copy in your file browser.
Desktop verifies the archive before opening its location.

## Try a different direction

- Send **`/fork`** on its own to make a separate chat from the latest committed
  message. Choose **Open fork** to switch. The original chat can keep working.
  Both chats work on the same project files, and the fork asks for its own
  access approvals.
- Choose **Edit and resubmit** on an earlier plain-text message to revise the
  active conversation. This requires an idle chat, an empty queue, and a
  resolved Goal if the chat has one. A message that started a goal or carried
  an attachment cannot be edited. Earlier file edits still belong to their
  files. [Branch or revise a chat](./clients.md#branch-or-revise-a-chat)

## Continue a long conversation

In an idle chat with an open, empty queue, send **`/compact`** on its own to
summarize earlier material for future model requests. The transcript stays in
the chat, and a **Conversation compacted** note marks where the summary took
over; open it to read the summary. Some ordinary Plan and Act text tasks
compact earlier context automatically, shown as **Conversation
auto-compacted**.
[Compact model context](./clients.md#compact-model-context)
