---
title: Work with subagents
description: See independent reviews in Desktop chat and give named subagents text assignments from a private ACP client.
keywords: [agent, subagent, assignment, delegation]
format: md
---

# Work with subagents

A subagent is a separate conversation that works on a text assignment while
the main agent continues.

## See independent reviews in Desktop

In Desktop, choose **Ultra** effort on a supported Gateway, saved OpenRouter or
saved Vercel AI Gateway connection to let the agent start one independent
review. The review appears in the turn's activity, and the finished turn
records whether the agent collected its findings. An Ultra goal can fund such a
review from its own allowance.
[Choose how much effort to use](./effort-and-goals.md#choose-how-much-effort-to-use)

Desktop chat does not create named subagents, and the model cannot create them
on its own. Deleting a chat also deletes any named subagents it owns.

## Give a named subagent assignments

A private ACP client connected to a host started with `--subagents` can create
and manage named subagents.
[Assign work to a named subagent](./clients.md#assign-work-to-a-named-subagent)

1. Finish an **Act** turn in the parent chat, then create a subagent with a
   name and an allowance of one to eight assignments.
2. Assign work to it. For example, ask a researcher to compare two approaches
   and explain which assumptions matter. Each assignment is text-only and has
   no workspace tools, so include the context you want it to use.
3. Inspect the subagent for its current or latest assignment and result. To
   give a follow-up, assign more work to the same subagent; it keeps the
   context of its own earlier work. Follow-ups wait in order and use the
   remaining allowance.

Pause holds the current assignment, Steer adds a correction to it, and Resume
continues the same work. Stop ends the current assignment and holds the
subagent's queue; Resume Queue starts the next waiting assignment, and a
waiting assignment can be withdrawn.

Send a message to leave context for the subagent's next assignment. An idle
subagent stays idle, a running one keeps its current assignment, and a message
uses no allowance.

A named subagent cannot be closed on its own. It stays with the parent chat
until that chat is deleted.
