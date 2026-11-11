---
title: Return to work and manage chat history
description: Reopen, archive, branch, or revise a saved workspace chat in Grida Desktop.
keywords: [agent chat history, Grida Desktop, branch chat, compact context]
format: md
---

# Return to work and manage chat history

## Reopen after a native Desktop update

An update keeps native chats in their separate history store. Select the saved
chat to read it again; reopening does not ask the model to repeat the work.
Previous TypeScript chats remain in their original storage and do not appear as
new native conversations.

If native chat is unavailable after an update, restore the accepted current
build and the chat's original model connection. The app does not start another
chat engine as a fallback. Keep the application data and previous chat files in
place while recovering; deleting them is not a connection reset.

## Reopen or organize a chat

In a native workspace chat, open the chat list at the top left to reopen a conversation.
Its transcript and retained work are available in the original chat. Review any
pending question, approval, or interruption before continuing.
[Guide and interrupt work](./controls.md)

Long chats open at the latest messages. Choose **Earlier messages** to step
back through the conversation, and **Back to latest** to return to current
work. Reading earlier messages leaves ongoing work running. If the history
changes while you browse, start again from the latest messages. Current turn
details appear with the latest messages.

Open **Chat options** (the three-dot menu) and choose **Rename chat** to change its title. **Archive chat** moves it out of the
active list and lets any ongoing work continue. Open **Archived chats** to find
it again or choose **Restore chat** to return it to the active list. When
**Delete chat** is available, it removes the chat’s private data. Saved project
files and independent forks stay in place.

## Find your previous chat archive

On an ordinary macOS ARM64 Desktop installation using native workspace chat,
new conversations start with their own history. Earlier chat data stays in its
existing location and does not appear in the native chat selector. This does
not create an archive or prevent an older installation from changing its own
data.

If your installation completed a verified archival handoff, choose **File →
Show Previous Chat Archive** to find the saved copy in your file browser.
Desktop verifies the archive before opening its location.

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
the chat. Some ordinary Plan and Act text tasks compact earlier context automatically.
[Compact model context](./clients.md#compact-model-context)
