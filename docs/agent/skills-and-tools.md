---
title: Use chat commands, skills, and tools
description: Use Desktop chat commands, give the agent project instructions and skills, and see which tools it can use.
keywords: [agent, slash commands, skills, AGENTS.md, tools, MCP]
format: md
---

# Use chat commands, skills, and tools

## Use a chat command

Type `/` in a Desktop workspace chat to see the commands the chat offers. The
list stays the same while the agent works; a command that has to wait says so
when you choose it. Select one; `/fork` and `/compact` are sent on their own.

- **`/plan`** adds a **Plan** badge so the next message investigates and
  proposes without changing anything. It starts no work and keeps your draft.
  While the agent works, that message waits in the queue; choosing `/plan`
  while steering turns steering off, because a Plan message cannot join the
  running turn.
  [Decide what the agent may do](./effort-and-goals.md#decide-what-the-agent-may-do)
- **`/goal`** adds a **Goal** badge; send the objective to start a persistent
  goal. Sent while the agent works, the goal waits in the queue and starts
  when its turn comes. A chat holds one goal at a time.
  [Keep an objective across turns](./effort-and-goals.md#keep-an-objective-across-turns)
- **`/side`** opens a side chat about this one without changing it.
- **`/stop`** stops the chat's background processes; the current turn keeps
  running. With none running, it says so.
- **`/fork`** starts a separate chat from the latest saved message. Your
  current chat stays selected until you choose **Open fork**. If Desktop
  cannot confirm the result, send the command again from the same chat.
- **`/compact`**, in an idle chat with nothing queued, summarizes earlier
  context. **Compacting…** shows while it runs; use the composer's main
  button to pause it. The full transcript stays in the chat, and an uncertain
  result leaves the previous model context in use.

`/fork` and `/compact` wait for the agent: chosen while it works, they say
they are unavailable until it finishes.

## Give the agent project instructions and skills

On macOS and Linux, put project instructions in `AGENTS.md` at the top of the
project folder. Desktop workspace chats and source-built hosts follow it
automatically. A message keeps the instructions it started with, and edits
apply to later messages.

You don't have to pick a skill. In a chat that can use project files, such
as a Desktop workspace chat, the agent sees each available skill's name and
description. When you name a skill or ask for work a skill describes, for
example "make a short deck about tides", the agent reads that skill's full
instructions and follows them. It says which skill it is using. The bundled
skills are `dotcanvas`, `slides` and `svg`. The agent reads a bundled skill
from Grida itself and a project skill as a project file, under the chat's
existing access. A skill adds guidance, never access.

A project skill in `.agents/skills/<name>/SKILL.md` (or
`.claude/skills/<name>/SKILL.md`) replaces a bundled skill with the same name.
The list is saved with each message, so later skill edits apply to later
messages.

To choose a skill yourself from a source-built host, add `--skill svg` to
`grida-agent run`, and repeat the flag for more skills. A selected skill's
instructions go to the agent directly. A selected project skill tells the
agent where its folder is; reading supporting files there still needs the
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
- If the model sends a tool request whose details Grida cannot read, the
  agent is told the request could not be read and can send it again in the
  same turn. Repeated failures end the turn at its step limit.

## Use tools from a local MCP server

On macOS and Linux, a source-built host can let the agent use an explicit list
of tools from one trusted MCP server on your computer. A Desktop build started
from source or an Insiders build can do the same for one workspace through
launch options. Only messages sent without the **Plan** badge can call those
tools; goals have none, and a side chat has the same tools as its chat. If a tool call loses its reply, check
the server for its effect before sending work that would repeat it.
[Use tools from a local MCP server](./clients.md#use-tools-from-a-local-mcp-server)
