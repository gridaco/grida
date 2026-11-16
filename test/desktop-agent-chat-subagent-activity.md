---
id: TC-DESKTOP-AGENT-CHAT-034
title: Inspect child activity without leaving or controlling the parent chat
module: desktop
area: agent-chat
tags: [agent-chat, subagents, activity, history, read-only, tabs]
status: untested
severity: high
date: 2026-11-16
updated: 2026-11-17
automatable: partial
covered_by:
  - editor/lib/agent-chat/turn-activity.test.ts
  - editor/scaffolds/desktop/workbench/native-turn-activity.test.tsx
  - editor/scaffolds/desktop/workbench/native-activity-timeline.browser.tsx
  - editor/lib/agent-chat/native-subagent-controller.test.ts
  - editor/scaffolds/desktop/workbench/native-agent-activity.test.tsx
  - editor/scaffolds/desktop/workbench/native-agent-activity.browser.tsx
  - editor/scaffolds/desktop/workbench/subagent-placement.test.ts
  - editor/scaffolds/desktop/workbench/subagent-tab-placement.test.tsx
  - editor/scaffolds/desktop/workbench/subagent-tab-placement.browser.tsx
  - desktop/src/main/native-agent-subagents.test.ts
  - desktop/src/main/native-subagent-activity.test.ts
  - desktop/src/main/native-agent-activity.test.ts
---

## Behavior

The selected parent chat has a read-only Subagents view with Active and Done
sections. In a workspace, transcript indicators and named lifecycle events
open or reveal one main content tab. The parent chat and composer stay visible
and usable, with the draft intact. Closing the tab only hides the viewer;
requesting it again reopens it. Passive updates do not steal focus from another
tab, and changing parent chats withdraws the previous chat's viewer. Standalone
file windows retain a chat-local fallback.

Stable child identities connect list rows, parent lifecycle events and child
conversations. Completed work stays accessible with no active child. Reading
a child's actual messages and activity starts no model request. Live text and retained history are distinct
from bounded assignment/result previews. Captured child execution metadata
cannot borrow the parent's current model or effort.

Named start/finish rows appear among parent commentary and individual tool
calls using recorded publication order, both while work runs and after
reopening. A lifecycle row breaks a group of consecutive tools. A completed
turn still keeps its final answer outside the collapsed work. Old or incomplete
history without ordering evidence keeps reachable lifecycle rows in an
explicit relative-order-unavailable section; timestamps do not invent their
placement among parent messages.

The Subagents view is read-only, including on older connections with only
assignment/result inspection. It offers no creation, assignment, steering,
messaging, pause, resume, stop or withdrawal controls. Closing the viewer stops
neither a child nor a process. Processes are separate in the workspace's bottom
Workspace utilities panel, beside Terminal. They use their existing chat-local
list and Stop controls, including ended entries when none are running.
Unsupported rich observation, incomplete history, stale reads and failures
remain visible rather than being presented as complete conversations.

## Steps

1. Open a saved parent chat with child work and leave an unsent draft. Click
   its subagent indicator. Confirm Subagents opens as a main content tab beside
   documents, with Active and Done counts, names, states and relative times.
   Confirm the parent composer remains usable. With no active children,
   completed history still opens. Expand additional rows when offered.
2. Select a child while it works. Confirm actual messages and activity update,
   with captured model/effort metadata. Go Back within the tab, then open its
   start or finish event from the parent transcript. Confirm it reveals the
   same tab and reaches the same child, without creating a duplicate tab.
3. Focus a document tab while child work updates. Confirm the document stays
   active. Close the Subagents tab, then click the transcript indicator again.
   Confirm the view reopens, no child work stops, and the parent draft and chat
   selection remain intact. Change the parent's future model and reopen the
   child; its captured metadata stays the same and no model work starts.
4. Inspect active, paused and completed children, then return to the list.
   Confirm there are no execution controls or editable instruction fields in
   either view, even when the connection supports child control operations.
   On an older connection, confirm the bounded inspection fallback is also
   read-only. Navigation and reading do not start, stop or alter child work.
5. Confirm Subagents has no Processes tab. In the bottom Workspace utilities
   panel, choose Processes beside Terminal. Inspect a host-retained ended entry
   with no process running, then close the panel. Confirm closing it did not
   stop other work.
6. Switch parent chats or close the viewer during a delayed read. Confirm the
   old tab is withdrawn and no late child text or status appears under the
   newly selected parent. In a standalone file window, confirm the same
   indicator still opens its chat-local read-only viewer.
7. Use a deterministic parent conversation that starts two children between
   commentary and tool calls and records their finishes in the opposite order.
   Confirm the named rows appear at those points, and that a tool summary does
   not span across a lifecycle row. Reopen the chat and earlier history: the
   same facts keep the same order without duplicated rows or new model work.
   Repeat with legacy ordering metadata absent and confirm the separate
   relative-order-unavailable section.

## Verification

Producer, Main, controller and component tests cover their exercised contracts.
This case records composed navigation, visual grouping and live-app interaction
that have not yet been manually verified. No real-provider spend is required
merely to validate presentation; use an existing child or a deterministic fixture.
