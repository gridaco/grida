---
id: TC-DESKTOP-AGENT-CHAT-034
title: Inspect child activity without leaving or controlling the parent chat
module: desktop
area: agent-chat
tags: [agent-chat, subagents, activity, history, controls]
status: untested
severity: high
date: 2026-11-16
updated: 2026-11-16
automatable: partial
covered_by:
  - editor/lib/agent-chat/native-subagent-controller.test.ts
  - desktop/src/main/native-agent-subagents.test.ts
  - desktop/src/main/native-subagent-activity.test.ts
  - desktop/src/main/native-agent-activity.test.ts
---

## Behavior

The selected parent chat has a Subagents activity view with Active and Done
sections. Stable child identities connect list rows, parent lifecycle events
and child conversations. Completed work stays accessible with no active child.
Reading a child's actual messages and activity leaves the parent and its draft
intact and starts no model request. Live text and retained history are distinct
from bounded assignment/result previews. Captured child execution metadata
cannot borrow the parent's current model or effort.

Child controls retain their exact observed target. Closing the viewer stops
neither a child nor a process. Processes use their existing chat-local list and
Stop controls, including ended entries when none are running. Unsupported rich
observation, incomplete history, stale reads and failures remain visible rather
than being presented as complete conversations.

## Steps

1. Open a saved parent chat with child work and leave an unsent draft. Open
   Subagents. Confirm Active and Done counts, names, states and relative times.
   With no active children, confirm completed history still opens. Expand
   additional rows when offered.
2. Select a child while it works. Confirm actual messages and activity update,
   with captured model/effort metadata. Go Back, then open its start or finish
   event from the parent turn's activity. Confirm it reaches the same child.
3. Return to the parent and confirm its chat selection and draft are intact.
   Change the parent's future model, then reopen the child. Confirm the child's
   captured metadata stays the same. Reopening a settled child starts no work.
4. If child controls are offered, pause and resume that child, then stop its
   current assignment. Confirm another child's work and the parent turn are
   unaffected. Any waiting queue remains visibly held until resumed.
5. Open Processes, inspect a host-retained ended entry with no process running,
   then close the activity view. Confirm closing it did not stop other work.
6. Switch parent chats or close the viewer during a delayed read. Confirm no
   late child text or control state appears under the newly selected parent.

## Verification

Producer, Main, controller and component tests cover their exercised contracts.
This case records composed navigation, visual grouping and live-app interaction
that have not yet been manually verified. No real-provider spend is required
merely to validate presentation; use an existing child or a deterministic fixture.
