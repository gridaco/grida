---
title: Plan work, choose effort, and pursue a goal
description: Choose how the agent works on the next message and give longer work a persistent objective.
keywords: [agent effort, Ultra, Plan, Act, persistent goals, Grida Desktop]
format: md
---

# Plan work, choose effort, and pursue a goal

## Decide what the agent may do

In a native workspace chat, choose **Plan** in **Mode for next message**
to inspect allowed material and work out an approach. Send a new message in
**Act** when you want the agent to carry out the work under the chat’s
permissions. The mode applies to the message you send or queue. Guidance
sent to the current turn keeps that turn’s mode.
[Understand agent permissions](./permissions.md)

## Choose how much effort to use

When **Effort for next message** is available, choose **Standard** for the
ordinary work allowance or **Ultra** for work that may benefit from an
independent review. Either effort can be used with Plan or Act. Ultra can
give one reviewer a separate text assignment while the main agent continues.
For a new ordinary review, the reviewer can read the primary workspace if it is
already allowed. It does not automatically receive the parent chat or additional
folder grants; folders inside the readable primary workspace remain accessible.
The turn summary records whether the agent collected that reviewer’s findings.
On supported saved OpenRouter and Vercel connections, Ultra is available for
ordinary messages; Goal-funded reviews remain available on supported Gateway
connections. The work allowance limits inference steps, not a monetary spend cap.
[Work with subagents](./subagents.md)

## Keep an objective across turns

1. In an idle chat with an empty queue, choose **Add goal**. Enter the
   objective, the criteria for completion, and the work allowance.
   Choose **Plan** or **Act** in the chat's mode selector before starting.
   The goal keeps that mode for its later work.
2. Select **Continue automatically within these limits** if the agent can
   reserve further work as it progresses. Then choose **Start goal**. The goal
   can pause for input or stop when its allowance runs out.
3. When the goal is **Ready for your review**, compare the result with your
   criteria. Choose **Confirm goal complete** when they are met. The chat
   keeps the proposal and confirmation so you can return to them later.

For example, set the goal “Find the open decisions in the project notes.”
Ask for each decision and the section where it appears. Check the retained
answer against the notes before confirming completion.
[Inspect and save results](./results.md)

Pause preserves the allowance already held for the task. Stop ends the active
turn and leaves the goal visible. [Guide and interrupt work](./controls.md)

Use **Edit goal** to revise the objective or success criteria of an active
goal. Its used and held allowance carries forward. Saving during a goal turn
stops that turn and keeps its recorded work. For a turn with a funded review,
use the task controls before editing.

When a native workspace Gateway connection offers **Effort for this goal**,
choose **Ultra** to let one independent review share the goal's inference
allowance. Use the task's Pause, Resume, or Stop controls during the funded
turn. If work finishes before the review can be accounted for, the goal keeps
its held steps. Choose **Refresh held allowance** to account for any settled
review. That control reads the recorded work and starts no new work.

In **Act** with **Ultra**, supported connections let you choose an existing
subagent under **Goal reviewer**. The Goal keeps that reviewer for eligible
later turns. Each funded assignment shares the Goal’s review allowance and
uses one assignment from the subagent’s own allowance. An unavailable
reviewer leaves the review unassigned.

Standard Act goals on supported connections can schedule a check-in during
their first turn. [Schedule a follow-up](./scheduled-work.md)

Private native clients can also use reviewed automatic verification.
[Use goals from a native client](./clients.md#work-toward-a-persistent-goal)
