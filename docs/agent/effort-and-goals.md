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

Open the model picker at the bottom of the composer and drag the **Effort**
slider: **Low**, **Medium**, **High**, **Extra high** and, on supported
connections, **Ultra**. Medium is the default; the reset button returns to it.
Low through Extra high set how much the model reasons before answering, for
models whose provider supports a reasoning setting. Other models keep their own
reasoning and the picker says so. **Ultra** uses the highest reasoning level and
also gives the work a larger allowance that may include an independent review.
Any effort can be used with Plan or Act, and changing it affects the next
request. Steering keeps the current turn's effort, and editing a queued or
earlier message keeps its original effort; resubmitting an earlier Ultra
message needs a connection that supports Ultra. Ultra can
give one reviewer a separate text assignment while the main agent continues.
For a new ordinary review, the reviewer can read the primary workspace if it is
already allowed. It does not automatically receive the parent chat or additional
folder grants; folders inside the readable primary workspace remain accessible.
The finished turn records whether the agent collected that reviewer’s findings.
On supported Gateway, saved OpenRouter, and saved Vercel connections, Ultra is
available for ordinary messages and Goal-funded reviews. The work allowance
limits inference steps. A native client starting a Gateway goal can also set a
spending ceiling, a separate limit.

## Keep an objective across turns

1. In an idle chat with an empty queue, type `/goal` and select it, or choose
   **Goal** from the **+** menu. A **Goal** badge appears in the composer
   without starting work; hover it and choose its **×** to remove it.
2. Describe the objective in your own words and send. The message is marked
   **Sent as goal** in the chat. The agent works from that objective and
   continues on its own within eight work turns and 64 inference steps.
   Choose **Ultra** before sending to let one independent review share the
   goal's allowance on supported connections. Other effort levels do not yet
   change a goal's reasoning: goal turns, including Ultra ones, use the
   model's default reasoning, as the effort panel notes while the **Goal**
   badge is on.
3. While the goal exists, a strip above the composer shows its status and
   objective, for example **Pursuing goal**, **Paused goal** or
   **Goal complete**. Use its buttons to clear, pause or resume, and edit the
   goal. Editing opens the objective text; saving keeps the goal's used
   allowance and stops any current goal turn while keeping its recorded work.
4. When the strip shows **Review goal**, compare the result with your
   objective and choose **Confirm** when it is met. The chat keeps the
   proposal and confirmation so you can return to them later.

Goal entry uses text and workspace references. Send or remove a pending
attachment before selecting it. Add `/plan` first for a goal that investigates
and proposes; later work keeps the instructions accepted when the goal started.

For example, set the goal “Find the open decisions in the project notes and
the section where each appears.” Check the answer against the notes before
confirming completion. [Inspect and save results](./results.md)

Pause preserves the allowance already held for the task. Stop ends the active
turn and leaves the goal visible. [Guide and interrupt work](./controls.md)

Desktop does not ask for separate success criteria, limits, a spending
ceiling, a named reviewer or a check-in when starting a goal. Native clients
can set those through the goal protocol.

Private native clients can also use reviewed automatic verification.
[Use goals from a native client](./clients.md#work-toward-a-persistent-goal)

## Set a maximum spend

A native client starting a Goal on a supported Gateway connection can set a
maximum spend: the total amount you authorize for that Goal. Desktop does not
offer this when starting a goal. Parent and
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
