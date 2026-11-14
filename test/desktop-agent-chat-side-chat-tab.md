---
id: TC-DESKTOP-AGENT-CHAT-023
title: A side chat opens as a workbench tab and ends with it
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
  - editor/scaffolds/desktop/workbench/workbench-panels.test.ts
  - editor/scaffolds/desktop/workbench/workbench-tab.test.ts
---

## Behavior

In the workspace workbench a side chat is shown as a **Side chat** tab in the
editor region, beside open files, instead of inside the chat pane. Opening a
side chat opens and focuses its tab; asking it a question from the chat's
composer while another tab is in front brings the tab forward. The tab and the
side chat share one life: closing the tab ends the side chat, and a side chat
that ends anywhere else (its own **Close side chat**, switching chats, closing
the workspace) closes the tab. A side chat that has ended cannot come back, so
its tab is never offered by reopen-closed-tab. File-only actions (reveal,
copy path, trash, tree selection, restore on the next launch) ignore the tab,
and trashing a folder never closes it.

## Steps

1. Open a workspace with a file tab open and a chat with a finished turn.
   Send `/side What did we decide?`. Expected: a **Side chat** tab opens after
   the file tab, is focused, and shows the question and answer. The chat pane
   shows no side chat section.
2. Click the file tab, then send `/side And why?` from the chat composer.
   Expected: the **Side chat** tab comes forward with the second exchange.
3. Close the **Side chat** tab with its ×. Expected: the file tab becomes
   active and the side chat ends; sending a new `/side` question opens a new,
   empty side chat tab. Press Cmd/Ctrl+Shift+T after closing it: no side chat
   tab returns.
4. Open a side chat again, then choose **Close side chat** inside it.
   Expected: its tab closes.
5. Open a side chat again, then switch to another chat in the chat list.
   Expected: the side chat tab closes.
6. With a side chat tab focused, press Cmd/Ctrl+W. Expected: it closes like
   step 4. With it focused, use Reveal in Finder / Copy Path shortcuts and
   trash a folder in the file tree. Expected: nothing happens to the tab.
7. Quit and reopen the workspace. Expected: file tabs are restored; no side
   chat tab is.

## Notes

A file window (single SVG or deck) has no tabbed editor region; there the side
chat shows under the chat instead.
