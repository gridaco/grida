---
title: Return to work and manage chat history
description: Reopen, archive, branch, or revise a saved workspace chat in Grida Desktop.
keywords: [agent chat history, Grida Desktop, branch chat, compact context]
format: md
---

# Return to work and manage chat history

## Reopen or organize a chat

In a native workspace chat, use the **Chat** selector to reopen a conversation.
Its transcript and retained work are available in the original chat. Review any
pending question, approval, or interruption before continuing.
[Guide and interrupt work](./controls.md)

Long chats open at the latest messages. Choose **Earlier messages** to step
back through the conversation, and **Back to latest** to return to current
work. Reading earlier messages leaves ongoing work running. If the history
changes while you browse, start again from the latest messages.

Choose **Rename chat** to change its title. **Archive chat** moves it out of the
active list and lets any ongoing work continue. Open **Archived chats** to find
it again or choose **Restore chat** to return it to the active list. When
**Delete chat** is available, it removes the chat’s private data. Saved project
files and independent forks stay in place.

## Try a different direction

- Send **`/fork`** on its own to make a separate chat from the latest committed
  message. Choose **Open fork** to switch. Both chats can refer to the same
  project files.
- Choose **Edit and resubmit** on an earlier plain-text message to revise the
  active conversation. This requires an idle chat, an empty queue, and a
  resolved Goal if the chat has one. Earlier file edits still belong to their
  files. [Branch or revise a chat](./clients.md#branch-or-revise-a-chat)
- Choose **Side chat** for a temporary question about the current context.
  You can add an excerpt from the answer to the parent draft before closing.
  [Ask in a side chat](./clients.md#ask-in-a-temporary-side-chat)

## Continue a long conversation

In an idle chat with an open, empty queue, send **`/compact`** on its own to
summarize earlier material for future model requests. The transcript stays in
the chat. Some Act tasks compact earlier context automatically.
[Compact model context](./clients.md#compact-model-context)
