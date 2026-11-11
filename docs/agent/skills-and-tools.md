---
title: Use chat commands, skills, and tools
description: Use native chat commands, attach a versioned skill, and choose when the agent can use local tools.
keywords: [agent, slash commands, skills, tools, MCP]
format: md
---

# Use chat commands, skills, and tools

## Use a chat command

Type `/` in a native Desktop workspace chat to see commands supported by
the connected host. Send the command on its own.

- **`/fork`** starts a separate chat from the latest committed message.
  Your current chat stays selected until you choose **Open fork**. If the
  result is unconfirmed, retry the command from the same chat.
- **`/compact`** summarizes earlier model context while the chat is idle
  and the queue is open and empty. Choose **Stop** to interrupt it. The
  original transcript remains available, and an uncertain result leaves
  the previous model context in use.

## Give a task a skill

Add `--skill svg` to a source-built native `grida-agent run` command. Repeat
the flag to include more skills. The bundled names are `dotcanvas`, `slides`,
and `svg`. An attached ACP client can list skills when the host offers
`co.grida/session/skills`, then include the returned versioned resource link
with the prompt. [Connect an agent client](./clients.md#connect-an-acp-client)

On Unix, the native host can read `AGENTS.md` in its explicitly readable
primary project folder. It looks for a selected project skill in
`.agents/skills/<name>/SKILL.md`, then `.claude/skills/<name>/SKILL.md`, then
the bundled set. An accepted or queued message keeps the instructions it
captured. New project-skill selections include the skill's workspace-relative directory so
the agent can locate supporting files. Reading those files still requires the
chat's existing workspace access. File changes apply to later messages. If an
ACP skill selection is stale, refresh the catalog and select it again.

## Use the tools available to the task

Skills supply guidance within the chat's current access. Choose **Plan** to
investigate or **Act** to use eligible action tools. If an action needs
additional access, review the exact request before choosing **Allow once**
or **Decline**. Finite commands require a native launch profile with a
supported confinement helper. [Understand agent permissions](./permissions.md)

A source-built native host can opt into an explicit list of tools from one
trusted local MCP server. The isolated Desktop Gateway preview can bind
such a server to one selected workspace. Only Act can invoke those tools.
Retained work keeps its original connection. If a call loses its reply,
check the server for its effect before sending work that would repeat it.
[Configure local MCP tools](./clients.md#use-tools-from-a-local-mcp-server)
