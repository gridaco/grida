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
project folder. To give a subdirectory its own instructions, put another
`AGENTS.md` there. Each file applies to the directory that contains it and
all directories below it. For example, `slides/AGENTS.md` applies to work
in `slides/`. If project instructions conflict for a file, the agent follows
the closest applicable `AGENTS.md`. Instructions in your chat message take
precedence over project guidance.

Desktop starts with the selected project folder. When a source-built host
has both an admitted project root and a starting directory within it, it
loads the instructions along the path from the root to that directory. As work
reaches deeper directories, the agent checks for applicable files there
using the workspace's existing tools. Instructions that Grida loads when it
accepts a message stay with that message while it waits or resumes. Edits
apply to later messages.

In a chat that can use project files, such as a Desktop workspace chat,
the agent sees names and descriptions for project and bundled skills.
When you name a listed skill or ask for work a skill describes, for
example "make a short deck about tides", the agent reads that skill's full
instructions and follows them. It says which skill it is using. The bundled
skills include `dotcanvas`, `slides` and `svg`. Workspace chats with bundled
FX also offer a skill for planning workflows and inspecting saved runs. A
Desktop turn with Browser access can discover guidance for inspecting pages.

In the Home or workspace composer, type `$` and choose a skill by name,
description, and source. Grida discovers skills installed as
`.agents/skills/<name>/SKILL.md` in your project and under your home directory.
Home shows your personal skills and bundled skills before you choose a
destination. Choosing a project also shows the skills in that project.
Project skills rank ahead of personal skills with the same name, followed by
bundled skills. Projects can also share skills under `.claude/skills/`.

A selection stays in the draft as a removable mention with a book icon and
the skill name. You can choose the personal copy of a skill even when the
project has one with the same name. Ordinary dollar text such as `$100`
stays in your message. After sending, the mention appears inline where you
placed it, including when you reopen the chat. Hover over it to see the
source the host accepted.
If the skill changed or was removed before sending, refresh the selection or
remove it and send again. Each accepted message keeps the skill version it
selected. All skills use the chat's existing permissions.

You can also send a plain `$skill-name` from Desktop or the terminal chat.
Grida loads the instructions when the name matches one available skill.
When several skills share the name, use the Desktop picker to choose a source.
Use a mention to invoke a personal skill.

A qualified name, such as `desktop-fx/desktop-fx`, chooses an eligible
extension's skill. Use the qualified name when multiple extensions offer the
same skill name.

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
The agent uses commands to find and read project files. Turn on the **Plan**
badge (**+ → Plan mode** or `/plan`) for read-only investigation. Plan uses
Desktop's normal read scope under read-only, offline confinement. Skills use the chat's existing permissions. [Understand agent permissions](./permissions.md)

Source-built headless and ACP hosts use the permission profile you supply.
[Work with selected folders](./clients.md#work-with-selected-folders)

In a Desktop **Act** chat with an attached workbench, describe the operation
you need. The agent can look up the available Desktop tools for that task,
such as listing open tabs, inspecting selected SVG objects or path points,
or editing an object's opacity. The lookup uses
the workbench bound when your message was sent. If it has since been closed
or replaced, send a new message from the current workbench. To show an
existing file or bundle, give its project-relative path or full path inside
the project, such as `slides/Launch.canvas`. Grida selects the viewer and
activates the existing tab if the artifact is already open. With Browser
available, the agent can also show a web link or check a specific page. When
several extensions could help, the agent sees a short
description of each and can look up its tools and skills.
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
