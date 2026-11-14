---
title: Use chat commands, skills, and tools
description: Use Desktop chat commands, give the agent project instructions and skills, and see which tools it can use.
keywords: [agent, slash commands, skills, AGENTS.md, tools, MCP]
format: md
---

# Use chat commands, skills, and tools

## Use a chat command

Type `/` in a Desktop workspace chat to see the commands you can use now.
Select one; `/fork` and `/compact` are sent on their own.

- **`/plan`** adds a **Plan** badge so the next message investigates and
  proposes without changing anything. It starts no work and keeps your draft.
  [Decide what the agent may do](./effort-and-goals.md#decide-what-the-agent-may-do)
- **`/goal`** adds a **Goal** badge; send the objective to start a persistent
  goal. It needs an idle chat with nothing queued.
  [Keep an objective across turns](./effort-and-goals.md#keep-an-objective-across-turns)
- **`/fork`** starts a separate chat from the latest saved message. Your
  current chat stays selected until you choose **Open fork**. If Desktop
  cannot confirm the result, send the command again from the same chat.
- **`/compact`**, in an idle chat with nothing queued, summarizes earlier
  context. **Compacting…** shows while it runs; use the composer's main
  button to pause it. The full transcript stays in the chat, and an uncertain
  result leaves the previous model context in use.

## Give the agent project instructions and skills

On macOS and Linux, put project instructions in `AGENTS.md` at the top of the
project folder. Desktop workspace chats and source-built hosts follow it
automatically. A message keeps the instructions it started with, and edits
apply to later messages.

Desktop does not offer a skill picker. From a source-built host, add
`--skill svg` to `grida-agent run`, and repeat the flag for more skills. The
bundled skills are `dotcanvas`, `slides` and `svg`. A project skill in
`.agents/skills/<name>/SKILL.md` (or `.claude/skills/<name>/SKILL.md`)
replaces a bundled skill with the same name. A selected project skill tells
the agent where its folder is; reading supporting files there still needs the
chat's existing access. ACP clients can list and select skills through the
skill catalog; if a saved selection has changed, refresh the catalog and
select it again. [Use durable client operations](./clients.md#use-durable-client-operations)

## Use the tools available to the task

A Desktop workspace chat on macOS and Linux runs under the **Default** access
shown in the composer. The agent reads, creates and edits files in the project
and runs commands there in a sandbox without asking each time; its commands
can read elsewhere on your computer but cannot write outside the project or
reach the internet. Turn on the **Plan** badge (**+ → Plan mode** or `/plan`)
when you want it to investigate without changing anything. Skills add
guidance but never add access. [Understand agent permissions](./permissions.md)

Source-built headless and ACP hosts use the permission profile you supply.
[Work with selected folders](./clients.md#work-with-selected-folders)

Current limits:

- The agent cannot render the SVG or HTML it writes to an image to check how
  it looks, so review visual results in the editor yourself.
- If the model sends a tool request Grida cannot read, the turn ends; send a
  follow-up message to continue.

## Use tools from a local MCP server

On macOS and Linux, a source-built host can let the agent use an explicit list
of tools from one trusted MCP server on your computer. A Desktop build started
from source or an Insiders build can do the same for one workspace through
launch options. Only messages sent without the **Plan** badge can call those
tools; goals and side chats have none. If a tool call loses its reply, check
the server for its effect before sending work that would repeat it.
[Use tools from a local MCP server](./clients.md#use-tools-from-a-local-mcp-server)
