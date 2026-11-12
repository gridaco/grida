---
id: TC-DESKTOP-AGENT-CHAT-017
title: Finished turns collapse their work and keep the answer visible
module: desktop
area: agent-chat
tags: [chat, transcript, progress, history]
status: verified
severity: high
date: 2026-11-12
updated: 2026-11-12
automatable: partial
covered_by:
  [
    editor/lib/agent-chat/turn-activity.test.ts,
    editor/lib/agent-chat/native-chat-controller.test.ts,
  ]
---

## Behavior

While a native turn runs, its commentary and actions stay in view as they
happen. When it finishes, that work collapses beneath one header such as
**Worked for 12s**, and the final answer stays visible below it. Expanding the
header shows the recorded commentary and actions in their original order;
consecutive actions read as one line such as “Read files, searched”, which
expands to each call and its outcome. A turn that finished normally with only
its answer shows no header or divider. A stopped turn shows **Stopped after …**
with its partial work in view and nothing to expand.

Every turn with recorded work keeps its own header, including after reopening the chat and on
earlier pages. Stopped and failed turns say so in their header. A pending
question or approval stays actionable outside the collapsed work. Expanding,
collapsing, paging and reopening only read recorded work: none of them repeats
an action or requests another model response. There is no separate execution
details panel; images the latest turn produced appear below its answer.

## Steps

1. In a native workspace chat, ask for a task that reads a file. Approve the
   read if asked. While it runs, confirm the commentary and an activity line
   appear. When it finishes, confirm a **Worked for …** header with the answer
   visible below it and the commentary hidden.
2. Select the header. Confirm the commentary and activity line appear in
   order. Select the activity line and confirm each call and its outcome.
   Collapse it again.
3. Send a second task that uses tools. Confirm both turns show their own
   collapsed header and answer.
4. Start a long task and choose **Stop**. Confirm its header reads
   **Stopped after …** and its partial work remains expandable.
5. Send a request the model service rejects. Confirm a **Failed** header.
6. Quit and reopen Desktop, then reopen the chat. Confirm every turn keeps its
   header and collapsed state. Choose **Earlier messages** in a long chat and
   confirm earlier turns are grouped the same way.
7. Confirm none of steps 2, 6 sent a new model request.
