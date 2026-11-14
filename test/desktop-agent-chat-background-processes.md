---
id: TC-DESKTOP-AGENT-CHAT-022
title: Background processes show while running and stop on request or window close
module: desktop
area: agent-chat
tags: [agent-chat, background-processes, exec-command, stop, composer]
status: untested
severity: high
date: 2026-11-14
updated: 2026-11-14
automatable: false
covered_by:
  - desktop/src/main/native-agent-background-processes.test.ts
  - desktop/src/main/native-chat-ipc.test.ts
  - editor/lib/agent-chat/native-chat-controller.test.ts
---

## Behavior

A command the agent starts can outlive its short wait and keep running as a
background process of the chat. It keeps running across turns until the agent
ends it, the person stops it, the chat is deleted, the window showing the chat
closes, or the app quits.

While at least one of the chat's processes runs, the composer toolbar shows a
neutral "N running" indicator. With none running, there is no indicator. The
indicator opens a list of the chat's processes: the command, the end of its
working directory, and whether it is running or ended (with its exit code).
Each running process has Stop; the list has Stop all.

Typing `/stop` on its own, or choosing "stop" in the command menu, stops every
background process of this chat. It does not stop the current turn: the turn's
Stop control is a separate action. The "stop" command appears only when the
chat offers background processes.

Switching to another chat in the same window, or closing a side chat, leaves
processes running. Reloading the window, navigating within it, or a renderer
crash also leaves them running: the window re-attaches the chat and reads its
current list again, so a development server survives a reload. Closing the
window that showed the chat stops its processes, unless another open window
has also shown that chat.

## Steps

1. Open a workspace and ask the agent to start a long-running command, such as
   a development server, and leave it running.
2. Expected: the transcript shows the command; the toolbar shows "1 running".
3. Open the indicator. Expected: the command, the tail of its folder and
   "running" are listed with Stop, plus Stop all.
4. Ask the agent to run a second long-running command. Expected: "2 running".
5. Click Stop on one process. Expected: it turns to "ended" (or leaves the
   list) and the indicator shows "1 running".
6. Switch to another chat, then back. Expected: the indicator still shows
   "1 running".
7. Type `/stop` and send. Expected: no message is sent, the turn is not
   stopped, and the indicator disappears.
8. Start another long-running command, then choose "stop" in the `/` menu.
   Expected: the indicator disappears without sending a message.
9. Start another long-running command, then reload the window. Expected:
   after the chat reopens, the indicator still shows "1 running" and the
   command is still running on the machine.
10. Close the workspace window and check the process list of the machine.
    Expected: the command has exited.
11. Repeat 10 with the same chat open in two windows and close only one.
    Expected: the command keeps running until the second window closes.

## Notes

Quitting the app shuts down the agent, which ends every process; there is no
separate quit step. The agent ends a deleted chat's processes itself.
