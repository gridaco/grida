---
id: TC-DESKTOP-AGENT-CHAT-023
title: A side chat opens as a workbench tab with the full chat and ends with it
module: desktop
area: agent-chat
tags: [agent-chat, side, workbench, tabs]
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
---

## Behavior

In the workspace workbench a side chat is shown as a **Side chat** tab in the
editor region, beside open files, instead of inside the chat pane. The tab
shows the same chat as the chat pane: streamed replies, turn activity,
questions and approvals, queued messages, background processes and the same
message box. It has no chat list, new-chat button or chat options, and its
message box offers no **`/side`**, **`/goal`**, **`/fork`**, **`/compact`**,
**Ultra** effort or other model; **Plan** stays available. Model and effort
start as the chat's.

`/side` opens the tab at once and puts the caret in its message box; while a
side chat is open, `/side` brings its tab forward. The tab and the side chat
share one life: closing the tab discards the side chat, and a side chat that
ends anywhere else (its own **Close side chat**, switching chats, deleting the
chat, closing the window) closes the tab. A discarded side chat cannot come
back, so its tab is never offered by reopen-closed-tab. File-only actions
(reveal, copy path, trash, tree selection, restore on the next launch) ignore
the tab, and trashing a folder never closes it.

## Steps

1. Open a workspace with a file tab open and a chat with a finished turn.
   Send `/side`. Expected: a **Side chat** tab opens after the file tab, is
   focused, and its message box has the caret. The chat pane is unchanged and
   its message box is empty.
2. In the tab, send `What did we decide?`. Expected: the reply streams in the
   tab exactly as in the chat pane, with turn activity and timing. Type `/` in
   the tab's message box: `side`, `goal`, `fork` and `compact` are not
   offered; `plan` is. The model picker shows the chat's model and offers
   effort up to Extra high only.
3. Click the file tab, then send `/side And why?` from the chat pane.
   Expected: the **Side chat** tab comes forward and sends `And why?` as its
   next message.
4. Close the **Side chat** tab with its ×. Expected: the file tab becomes
   active and the side chat is discarded; sending `/side` opens a new, empty
   side chat tab. Press Cmd/Ctrl+Shift+T after closing it: no side chat tab
   returns.
5. Open a side chat again, then choose **Close side chat** inside it.
   Expected: its tab closes.
6. Open a side chat again, then switch to another chat in the chat list.
   Expected: the side chat tab closes.
7. With a side chat tab focused, press Cmd/Ctrl+W. Expected: it closes like
   step 5. With it focused, use Reveal in Finder / Copy Path shortcuts and
   trash a folder in the file tree. Expected: nothing happens to the tab.
8. Quit and reopen the workspace. Expected: file tabs are restored; no side
   chat tab is, and the chat list never shows a side chat.

## Notes

A file window (single SVG or deck) has no tabbed editor region; there the side
chat shows under the chat instead, with the same chat and **Close side chat**.
Only the window that opened a side chat can show or drive it.
