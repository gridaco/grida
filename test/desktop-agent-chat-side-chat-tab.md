---
id: TC-DESKTOP-AGENT-CHAT-023
title: Each side chat opens as its own workbench tab, starts empty, is titled, and ends with its tab
module: desktop
area: agent-chat
tags: [agent-chat, side, workbench, tabs, title]
status: untested
severity: medium
date: 2026-11-15
updated: 2026-11-15
automatable: true
covered_by:
  - editor/scaffolds/desktop/workbench/side-chat-tab-placement.test.tsx
  - editor/scaffolds/desktop/workbench/side-chat-placement.test.ts
  - editor/scaffolds/desktop/workbench/workbench-panels.test.ts
  - editor/scaffolds/desktop/workbench/workbench-tab.test.ts
  - editor/lib/agent-chat/native-chat-controller.test.ts
  - desktop/src/main/native-chat-ipc.test.ts
  - desktop/src/main/native-agent-chat.test.ts
  - crates/grida-agent/tests/process/side_chats.rs
---

## Behavior

In the workspace workbench each side chat is shown as its own tab in the
editor region, beside open files, instead of inside the chat pane. A tab
shows the same chat as the chat pane: streamed replies, turn activity,
questions and approvals, queued messages, background processes and the same
message box. It has no chat list, new-chat button or chat options, and its
message box offers no **`/side`**, **`/goal`**, **`/fork`**, **`/compact`**,
**Ultra** effort or other model; **Plan** stays available. Model and effort
start as the chat's.

A side chat starts empty: it knows the chat's conversation but shows only its
own messages. Its tab is titled **Side chat** until the first message there is
titled the same way a new chat is; then the tab and the side chat's header
show that title. The title never appears in the chat list and cannot be
renamed.

`/side` with a question always opens a new side chat tab and sends the
question there. `/side` alone (typed, or chosen from the `/` menu) brings
forward the side chat used last (opened, shown or sent from most recently),
or opens a new empty one when none is open, and puts the caret in its message
box. A chat holds at most eight side chats; one more is refused with a notice
in the chat pane and opens no tab.

A tab and its side chat share one life: closing the tab discards that side
chat only, and a side chat that ends anywhere else (its own **Close side
chat**) closes its tab. Switching chats, deleting the chat or closing the
window discards every side chat of the chat and closes all their tabs. A
discarded side chat cannot come back, so its tab is never offered by
reopen-closed-tab. File-only actions (reveal, copy path, trash, tree
selection, restore on the next launch) ignore the tabs, and trashing a folder
never closes them.

## Steps

1. Open a workspace with a file tab open and a chat with a finished turn.
   Send `/side`. Expected: a **Side chat** tab opens after the file tab, is
   focused, and its message box has the caret. It shows no messages: none of
   the chat's earlier conversation appears. The chat pane is unchanged and its
   message box is empty.
2. In the tab, send `What did we decide?`. Expected: the reply streams in the
   tab exactly as in the chat pane, with turn activity and timing, and answers
   from the chat's conversation. Only this question and its reply show. Within
   a few seconds the tab and the side chat header change from **Side chat**
   to a short title for the question; the chat list does not gain an entry.
   Type `/` in the tab's message box: `side`, `goal`, `fork` and `compact` are
   not offered; `plan` is. The model picker shows the chat's model and offers
   effort up to Extra high only.
3. Edit `What did we decide?` in the side chat and send the edit. Expected:
   the reply is replaced, and the chat's earlier conversation still does not
   appear.
4. Click the file tab, then send `/side And why?` from the chat pane.
   Expected: a second side chat tab opens after the first, focused, and sends
   `And why?` there; the first tab keeps its own conversation.
5. Click the file tab, then send `/side` alone from the chat pane. Expected:
   the second side chat tab comes forward. Send a message in the first side
   chat tab, click the file tab, then choose `side` from the `/` menu.
   Expected: the first side chat tab comes forward.
6. Close the first side chat tab with its ×. Expected: the second stays open
   with its conversation; the side chat is discarded. Press Cmd/Ctrl+Shift+T:
   no side chat tab returns.
7. Open side chats with `/side 1` … `/side 8` until eight are open, then send
   `/side 9`. Expected: no ninth tab opens, and the chat pane shows that this
   chat already has 8 side chats open. Close one and send `/side 9` again:
   it opens.
8. Choose **Close side chat** inside a side chat. Expected: only its tab
   closes.
9. With several side chats open, switch to another chat in the chat list.
   Expected: every side chat tab closes.
10. With a side chat tab focused, press Cmd/Ctrl+W. Expected: it closes like
    step 8. With it focused, use Reveal in Finder / Copy Path shortcuts and
    trash a folder in the file tree. Expected: nothing happens to the tab.
11. Quit and reopen the workspace. Expected: file tabs are restored; no side
    chat tab is, and the chat list never shows a side chat or its title.

## Notes

A file window (single SVG or deck) has no tabbed editor region; there the side
chat shows under the chat instead, with the same chat, title and **Close side
chat**. It shows one side chat at a time: the one opened or brought forward
last. Closing it shows the one opened before it, until none is left. Only the
window that opened a side chat can show or drive it.
