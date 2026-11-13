---
title: Grida Agent
description: Start a workspace chat, guide its work, and return to saved results in Grida Desktop or from a native client.
keywords: [agent, Desktop, workspace, chat, ACP]
format: md
---

# Grida Agent

Use a workspace chat in Grida Desktop on macOS or Linux to ask about a
project, plan a change, or carry out a task with the access you grant.
Available controls and inputs vary with the model connection.

## Start a workspace chat

1. Open a workspace and its chat pane with a model connection configured
   for your build. [Choose models and understand usage](./models-and-usage.md)
2. Give the agent an objective and name the files or tabs that matter.
   Select `/plan` to investigate and propose a change, or send an ordinary
   request to do the work under the chat's permissions. [Start with files and folders](./getting-started.md)
3. Review requests for additional access as they appear. To change the
   direction of work, send a correction to the current turn. Queue a
   message when it belongs in the next turn. [Understand permissions](./permissions.md)
   · [Guide and interrupt work](./controls.md)

For example, ask in **Plan**, “Compare the two drafts and propose the
smaller change.” Review the proposal, then remove the **Plan** badge and send a new
message specifying the change you want. [Plan before acting](./clients.md#plan-before-carrying-out-a-task)

## Return to the work

Reopen the chat from the workspace to see its messages and any retained
work. Choose **Resume** once a paused turn is ready to continue. **Stop**
ends the current turn and holds the queue. Expand a finished turn to see
its tool activity; retained images appear below the latest answer.
[Inspect and save results](./results.md)

Branch a saved chat to explore another approach. A branch can still work
with the same project files.
[Return to work and manage chat history](./history.md)

## Give independent work a place

Choose **Ultra** from the composer’s model picker when the agent should decide
whether to start an independent review on a supported connection. A
persistent goal can keep a larger task's objective, success criteria, and work
allowance visible across turns. Named subagents and scheduled check-ins are
available to headless and ACP clients; Desktop chat does not offer them.

- [Work with subagents](./subagents.md)
- [Plan work, choose effort, and pursue a goal](./effort-and-goals.md)
- [Schedule a follow-up](./scheduled-work.md)

## Use a native client

Run a task from a script or connect a local ACP client with the headless
`grida-agent` host, which you build from source. Select a state directory to keep chats across restarts.
The client guide covers provider setup, permissions, supported commands,
and how to inspect a task after it stops. [Connect an agent client](./clients.md)

- [Change agent settings](./settings.md)
- [Automate lifecycle checks](./hooks.md)
- [Use chat commands, skills, and tools](./skills-and-tools.md)
- [Connect another agent to Grida with MCP](./grida-mcp.md)

For specific availability or configuration details, see the
[feature catalog](./features.md) and [agent configuration reference](../reference/agent-configuration.md).
