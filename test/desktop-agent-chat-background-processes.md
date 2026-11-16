---
id: TC-DESKTOP-AGENT-CHAT-022
title: Background processes show while running and stop on request or window close
module: desktop
area: agent-chat
tags:
  [agent-chat, background-processes, exec-command, stop, composer, utilities]
status: untested
severity: high
date: 2026-11-14
updated: 2026-11-16
automatable: partial
covered_by:
  - desktop/src/main/native-agent-background-processes.test.ts
  - desktop/src/main/native-chat-ipc.test.ts
  - editor/lib/agent-chat/native-chat-controller.test.ts
  - editor/scaffolds/desktop/workbench/workspace-utilities.test.ts
  - editor/scaffolds/desktop/workbench/workspace-utilities-panel.test.tsx
  - editor/scaffolds/desktop/workbench/workspace-utilities.browser.tsx
---

## Behavior

A command the agent starts can outlive its short wait and keep running as a
background process of the chat. It keeps running across turns until the agent
ends it, the person stops it, the chat is deleted, the window showing the chat
closes, or the app quits.

The composer has no process badge or running count. The bottom Workspace
utilities panel has Terminal and Processes tabs. Processes lists the selected
main chat's commands, working folders and running/ended states, with Stop and
Stop all controls. Retained ended entries remain available. Terminal is a
separate interactive shell; switching tabs or collapsing the panel keeps it
alive. Closing the panel does not stop agent processes.

Typing `/stop` on its own, or choosing "stop" in the command menu, stops every
background process of this chat. It does not stop the current turn: the turn's
Stop control is a separate action. The "stop" command appears only when the
chat offers background processes.

Switching to another chat does not stop this chat's processes. A side chat's
processes can be stopped using its `/stop` command. Reloading the window, navigating within it, or a renderer
crash also leaves them running: the window re-attaches the chat and reads its
current list again, so a development server survives a reload. Closing the
window that showed the chat stops its processes, unless another open window
has also shown that chat.

## Steps

1. Open a workspace and ask the agent to start a long-running command, such as
   a development server, and leave it running.
2. Expected: the transcript shows the command; the composer has no process badge.
3. Open Workspace utilities and select Processes. Expected: the command, the tail of its folder and
   "running" are listed with Stop, plus Stop all.
   In the bottom Workspace utilities panel, select Processes. Expected: the
   same selected chat's list is shown beside a Terminal tab, without starting
   a human terminal session. Start Terminal, switch to Processes, then back.
   Expected: the same terminal session and its output remain. Collapse and
   reopen the panel; the terminal session and agent processes keep running.
   While a terminal is still starting, switch to Processes or close the panel
   and focus the chat draft. Expected: startup does not move focus to the hidden
   terminal.
4. Ask the agent to run a second long-running command. Expected: both processes appear in Processes.
5. Click Stop on one process. Expected: it turns to "ended" (or leaves the
   list) and the other process remains running.
6. Switch to another chat, then back. Expected: Processes shows the same running command.
7. Type `/stop` and send. Expected: no message is sent, the turn is not
   stopped, and the running count clears. Retained ended entries remain in the Processes tab.
   Open Processes in Workspace utilities. Expected: retained ended entries
   remain readable and no running-process Stop action is offered for an ended
   entry. Subagents has no Processes tab.
8. Start another long-running command, then choose "stop" in the `/` menu.
   Expected: the running count clears without sending a message.
9. Start another long-running command, then reload the window. Expected:
   after the chat reopens, Processes shows the running command, and the
   command is still running on the machine.
10. Close the workspace window and check the process list of the machine.
    Expected: the command has exited.
11. Repeat 10 with the same chat open in two windows and close only one.
    Expected: the command keeps running until the second window closes.

## Notes

Quitting the app shuts down the agent, which ends every process; there is no
separate quit step. The agent ends a deleted chat's processes itself.
