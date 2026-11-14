---
title: Grida Agent
description: Where the Grida agent runs, how to start and continue work in a Desktop chat, and where each feature guide lives.
keywords: [agent, Desktop, workspace, chat, ACP, headless]
format: md
---

# Grida Agent

Ask the agent about a project, plan a change, or have it carry out a task.

## Where you can use it

- **Grida Desktop on macOS and Linux.** Chat in a workspace folder or in a
  deck's own window. On macOS you can also chat about a standalone SVG. The
  default model runs on your Grida account; you can also use your own
  OpenRouter or Vercel AI Gateway key or an approved endpoint.
  [Choose models and understand usage](./models-and-usage.md)
- **Grida Desktop on Windows** opens files and media, but agent chat is not
  available.
- **From a script or another app.** Build the `grida-agent` host from source
  to run a task headlessly or to connect a local Agent Client Protocol (ACP)
  client. [Connect an agent client](./clients.md)

## Start a workspace chat

1. Open a folder in Grida Desktop and open its chat pane. The model button at
   the bottom right of the composer shows the model the chat will use.
2. Describe what you want and mention the files that matter with `@`, for
   example “Summarize @README.md and list the open TODOs.” To investigate
   without changing anything, type `/plan` first.
   [Start a task with files and folders](./getting-started.md)
3. Send. The agent reads and edits files in the project and runs commands
   there in a sandbox; other folders and the internet are off.
   [Understand agent permissions](./permissions.md)

For example, with the **Plan** badge on, ask “Compare the two drafts and
propose the smaller change.” Review the proposal, then remove the badge and
send a message describing the change you want.
[Plan work, choose effort, and pursue a goal](./effort-and-goals.md)

## Guide the work while it runs

A message you send while the agent works joins the queue above the composer
and runs next. When shown, choose **Steer** on it to change the current
turn's direction instead. The composer's main button pauses the agent; choose
▶ to resume the same turn, or send a new message to end the paused turn and
run yours next. Answer the agent's questions in their cards.
[Guide and interrupt work](./controls.md)

## Continue later

Reopen a chat from the chat list at the top left of the pane to see its
messages. A finished turn collapses to a **Worked for …** line above its
answer; select it to see what the agent did. Images the latest turn produced
appear below its answer. [Inspect and save results](./results.md)

Type `/fork` to branch the chat and try another approach, or `/compact` to
summarize a long conversation.
[Return to work and manage chat history](./history.md)

## Give larger work room

Choose **Ultra** effort in the model picker when the agent should be able to
ask an independent reviewer to check its work. To keep a larger task going
across turns, type `/goal` or choose **+ → Goal**, describe the objective and
send. [Plan work, choose effort, and pursue a goal](./effort-and-goals.md)

## All guides

- [Start a task with files and folders](./getting-started.md)
- [Choose models and understand usage](./models-and-usage.md)
- [Understand agent permissions](./permissions.md)
- [Guide and interrupt work](./controls.md)
- [Plan work, choose effort, and pursue a goal](./effort-and-goals.md)
- [Inspect and save results](./results.md)
- [Return to work and manage chat history](./history.md)
- [Use chat commands, skills, and tools](./skills-and-tools.md)
- [Change agent settings](./settings.md)
- [Automate lifecycle checks](./hooks.md)
- [Work with subagents](./subagents.md)
- [Schedule a follow-up](./scheduled-work.md) (headless and ACP clients)
- [Connect an agent client](./clients.md)
- [Connect another agent to Grida with MCP](./grida-mcp.md)

The [feature catalog](./features.md) lists each capability's availability, and
the [agent configuration reference](../reference/agent-configuration.md)
covers the configuration file.
