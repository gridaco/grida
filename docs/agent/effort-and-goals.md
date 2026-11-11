---
title: Plan work, choose effort, and pursue a goal
description: Choose how the agent works on the next message and give longer work a persistent objective.
keywords: [agent effort, Ultra, Plan, Act, persistent goals, Grida Desktop]
format: md
---

# Plan work, choose effort, and pursue a goal

## Decide what the agent may do

In a native workspace chat, type `/plan` and select it to add a **Plan**
badge. Describe what to investigate and send the message. Remove the badge
before sending a new request to carry out the work under the chat’s permissions.
Selecting the command starts no work and keeps the rest of your draft.
Planning instructions apply to the message you send or queue; guidance sent
to the current turn keeps that turn’s accepted instructions. Permissions and
effort remain separate choices.
[Understand agent permissions](./permissions.md)

## Choose how much effort to use

Open the model picker at the bottom of the composer. When effort is available,
choose **Standard** for the ordinary work allowance or **Ultra** for work that
may benefit from an independent review. Either effort can be used with Plan or Act. Ultra can
give one reviewer a separate text assignment while the main agent continues.
For a new ordinary review, the reviewer can read the primary workspace if it is
already allowed. It does not automatically receive the parent chat or additional
folder grants; folders inside the readable primary workspace remain accessible.
The turn summary records whether the agent collected that reviewer’s findings.
On supported Gateway, saved OpenRouter, and saved Vercel connections, Ultra is
available for ordinary messages and Goal-funded reviews. The work allowance
limits inference steps. An optional Gateway spending ceiling is a separate limit.
[Work with subagents](./subagents.md)

## Keep an objective across turns

1. In an idle chat with an empty queue, type `/goal` and select it. The
   **Goal** badge appears without starting work. Describe the objective and
   what success looks like, then send. The description becomes both the objective
   and its completion criterion. Sending authorizes automatic continuation within
   eight work turns and 64 inference steps.
2. To set separate criteria or different limits, open the **Goal** badge and
   choose **Customize goal…** before starting. You can turn automatic continuation
   off in this form. Add `/plan` first for a goal that investigates and proposes;
   later work keeps the instructions accepted when the goal started.
3. Open the **Goal** badge or **Chat options → Goal details** to inspect progress.
   When it is **Ready for your review**, compare the result with your criteria.
   Choose **Confirm goal complete** when they are met. The chat keeps the proposal
   and confirmation so you can return to them later.

Goal entry uses text and workspace references. Send or remove a pending attachment
before selecting it. Cancelling the custom form keeps the composer’s Goal intent;
removing the intent starts no work.

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

When a supported native workspace connection offers **Effort for this goal**,
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

## Set a maximum spend

When a Gateway connection offers **Maximum spend (USD, optional)** while
starting a Goal, enter the total amount you authorize for that Goal. Parent and
funded subagent requests share one retained allocation. Each paid request has a
provider-enforced ceiling; separate paid media and external-tool lanes are not
available to capped Goal work. BYOK, custom endpoints and subscription
connections do not offer this monetary ceiling.

The Goal shows charged, held and available amounts separately. Its fixed per-request
ceiling divides the total by the inference-step allowance. A large request can
exceed its share even when the task has more remaining; choose the spending
ceiling and step allowance together before starting. A capped Goal supports at
most 4,096 inference steps. An interrupted
request or pending billing record keeps its hold. Refreshing authoritative
billing can settle that original request; it does not repeat inference or refund
an unknown outcome. Pause, restart, retry and objective edits preserve the same
allocation. Deleting a child does not reset the parent allocation.

The selected service must support capped requests. An older or unavailable
service fails the request without falling back to an uncapped route. The amount
is exact; unsupported precision is rejected rather than rounded. Inference-step
and work-turn allowances still apply independently.
