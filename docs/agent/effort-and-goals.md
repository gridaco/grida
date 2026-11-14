---
title: Plan work, choose effort, and pursue a goal
description: Choose how the agent works on the next message and give longer work a persistent objective.
keywords: [agent effort, Ultra, Plan, persistent goals, Grida Desktop]
format: md
---

# Plan work, choose effort, and pursue a goal

Plan, effort and goals are available in Grida Desktop on macOS and Linux and
in headless and ACP clients. This guide describes Desktop; clients use the
[client guide](./clients.md#plan-before-carrying-out-a-task).

## Decide what the agent may do

Type `/plan` and select it, or choose **+ → Plan mode**, to add a **Plan**
badge. Describe what to investigate and send. The agent reads and proposes
without changing files or running commands. The badge stays for later
messages until you remove it (hover it and choose ×) or choose **Plan mode**
again. Adding the badge starts no work and keeps the rest of your draft.

Messages you queue keep the mode they were sent with; a correction steered
into a running turn follows that turn's mode. Plan does not change the
agent's access or effort. [Understand agent permissions](./permissions.md)

## Choose how much effort to use

The model button at the bottom right of the composer shows the model name
followed by its effort. Select it and drag the **Effort** slider: **Low**,
**Medium**, **High**, **Extra high** and, on supported connections,
**Ultra**. Medium is the default; the reset button returns to it.

Low through Extra high set how much the model reasons before answering, for
models whose provider supports a reasoning setting. Other models keep their
own reasoning, and the panel says so. Any effort works with Plan and applies
to your next message. Steering keeps the current turn's effort, and editing a
queued or earlier message keeps its original effort.

**Ultra** uses the highest reasoning level and gives the work a larger
allowance. With Ultra, the agent can ask one independent reviewer to check its
work while it continues. The reviewer can read the project but does not see
your chat. Its work appears in the turn's activity. Ultra is available on
Grida Gateway, saved OpenRouter and saved Vercel AI Gateway models; the panel
says when the selected model cannot use it. Resubmitting an earlier Ultra
message needs a model that supports Ultra.
[Work with subagents](./subagents.md)

## Keep an objective across turns

1. In an idle chat with nothing queued, type `/goal` and select it, or choose
   **+ → Goal**. A **Goal** badge appears in the composer without starting
   work; hover it and choose × to remove it.
2. Describe the objective in your own words and send. The message is marked
   **Sent as goal** in the chat. The agent works from that objective and
   continues on its own within eight work turns and 64 inference steps.
   Choose **Ultra** before sending to let one independent review share the
   goal's allowance. Other effort levels do not change a goal's reasoning:
   goal turns use the model's default reasoning, as the effort panel notes
   while the **Goal** badge is on.
3. While the goal exists, a strip above the composer shows its status and
   objective, for example **Pursuing goal** or **Paused goal**. Use its
   buttons to clear the goal, pause or resume it, and edit it. Editing opens
   the objective text; saving keeps the goal's used allowance and stops any
   current goal turn while keeping its recorded work.
4. When the strip shows **Review goal**, compare the result with your
   objective and choose **Confirm** when it is met. The strip then shows
   **Goal complete**, with **Dismiss goal** in place of **Clear goal**. The
   chat keeps the proposal and confirmation so you can return to them later.

If the goal stops before it is done, the strip says why:

- **Goal needs input**, **Goal stalled** or **Goal can't continue**: answer or
  fix what the latest reply asks for, then choose **Resume goal**.
- **Goal needs review**: check the work against the objective before
  resuming or clearing the goal.
- **Goal interrupted**: Grida could not confirm how the last goal turn ended.
  Review its work, then clear the goal and start a new one if more is needed.
- **Goal out of allowance**: automatic work has ended. Clear the goal and
  start a new one to keep going.

If an Ultra review finishes after its goal turn, choose **Refresh goal
allowance** on the strip before resuming.

Goal entry takes text and `@` mentions; attachments are unavailable while the
**Goal** badge is on. Add the **Plan** badge as well for a goal that
investigates and proposes; later goal turns keep the instructions accepted
when the goal started.

For example, set the goal “Find the open decisions in the project notes and
the section where each appears.” Check the answer against the notes before
confirming. [Inspect and save results](./results.md)

To hold a goal, choose **Pause goal** on its strip, then **Resume goal** to
continue with the allowance it already has. Pausing with the composer's main
button pauses only the current turn. [Guide and interrupt work](./controls.md)

Desktop does not ask for separate success criteria, allowances, a spending
limit, a named reviewer or a check-in when starting a goal. Clients can set
those through the goal protocol.
[Use goals from a client](./clients.md#work-toward-a-persistent-goal) ·
[Set a goal's spending limit](./clients.md#set-a-goals-spending-limit)
