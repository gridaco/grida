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
skills include `dotcanvas`, `slides` and `svg`. Workspace chats with bundled
FX also offer `desktop-fx` for working with FX workflows. The agent reads a bundled skill
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

With **Auto** or **Ask for approval**, a Desktop workspace chat on macOS and
Linux can read, create and edit files in the project and run commands there
in a sandbox without asking each time. Commands can read elsewhere on your
computer. The sandbox limits writes to the project and a temporary directory,
and the agent needs approval to connect a command to a public destination.
Turn on the **Plan** badge (**+ → Plan mode** or `/plan`)
when you want it to investigate without changing anything. Skills add
guidance but never add access. [Understand agent permissions](./permissions.md)

Source-built headless and ACP hosts use the permission profile you supply.
[Work with selected folders](./clients.md#work-with-selected-folders)

In a Desktop **Act** chat with an attached workbench, describe the operation
you need. The agent can look up the available Desktop tools for that task,
such as listing open tabs, inspecting selected SVG objects or path points,
or editing an object's opacity. The lookup uses
the workbench bound when your message was sent. If it has since been closed
or replaced, send a new message from the current workbench. Ask the agent to
show a workspace file or web link and the workbench chooses its viewer. Ask
it to check how a web page behaves and it can use Browser tools on the
specific page. When several extensions could help, the agent sees a short
description of each and can look up the chosen extension's tools or skill.
A request about an FX workflow can lead the agent to the bundled FX skill,
which uses the chat's existing command permissions.

Current limits:

- Browser captures show a page's current viewport. Review the appearance of
  a standalone SVG in its editor.
- If the model sends a tool request whose details Grida cannot read, the
  agent is told the request could not be read and can send it again in the
  same turn. Repeated failures end the turn at its step limit.

## Search the web for one message

With **GPT-6.2 Sol** on a connected **ChatGPT Subscription**, the agent can
search the live web when a question needs current information. Ask a question
from Home or in a workspace chat, or ask directly, for example “Search the
web for today’s forecast in Seoul.” **Settings → Personalization → Web search**
controls this across workspaces and is on by default.

When the model searches, the chat shows the reported search activity. Open a
cited source from the reply to read it. Sources remain available when you
reopen the chat. A reply can have no citations.
[Web search preferences](./desktop-settings.md#personalization)

## Use tools from a local MCP server

On macOS and Linux, a source-built host can let the agent use an explicit list
of tools from one trusted MCP server on your computer. A Desktop build started
from source or an Insiders build can do the same for one workspace through
launch options. Only messages sent without the **Plan** badge can call those
tools; goals have none, and a side chat has the same tools as its chat. If a tool call loses its reply, check
the server for its effect before sending work that would repeat it.
[Use tools from a local MCP server](./clients.md#use-tools-from-a-local-mcp-server)
