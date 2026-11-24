---
title: Connect an agent client
description: Run Grida Agent headlessly or connect an Agent Client Protocol client to its native host.
keywords: [agent, headless, ACP, automation, native host]
doc_tasks: [enhance]
format: md
---

# Connect an agent client

The native Grida Agent host runs tasks from scripts and serves Agent Client
Protocol (ACP) clients. Build it from source to use it. Scripts, ACP clients
and Grida Desktop use the same session format and behave the same way, but
each keeps its own saved chats: Desktop in its own workspace storage, and a
headless host in the state directory you choose.

This guide covers headless runs and ACP clients. For Desktop chat, start from
the [Grida Agent overview](./index.md).

## Where it runs

Grida Desktop chat runs on macOS and Linux; standalone SVG chat is macOS only.
Grida Desktop on Windows keeps file and media tools, but agent chat is not
available. The headless host's workspace tools, commands and attachments run
on macOS and Linux.

To work on Desktop itself, start the local editor and its local authentication
services before starting the Desktop shell. See the
[authenticated local setup](https://github.com/gridaco/grida/blob/main/CONTRIBUTING.md#authenticated-local-development).
The Desktop development command prepares the native worker and helper before
launch.

## Build the host

From the Grida repository, build the executable with the pinned Rust toolchain.

```sh
cargo build -p grida-agent --locked
```

The resulting executable is `target/debug/grida-agent`. Choose an absolute
state-directory path and a project directory. Keep the state directory to retain
your chats across process restarts. One host process owns a state directory at a
time.

Choose a text model and a base URL for its protocol. Chat Completions is the
default. Use `--provider responses`, `--provider anthropic`, or
`--provider gemini` for the corresponding streaming protocol. The host accepts
HTTPS endpoints and loopback HTTP endpoints. When a credential is required,
set it in an environment variable and select that variable with `--credential-env`.

On macOS and Linux, private stdio ACP with `--provider responses` and an
OpenAI model whose published facts declare PNG input and tool calls (for
example `--model gpt-6.1-sol`) also accepts one inline PNG up to 256 KiB per
input. Other model names stay text-only. Supply the PNG bytes in
the image content block. Accepted inputs keep the original in the private
agent state directory so queued work can use it after a restart. The selected
provider receives it when the conversation uses it. Chat history identifies
the retained image. An unsupported, invalid, or missing image stops the
request with an error. [OpenAI image input guide](https://developers.openai.com/api/docs/guides/images-vision)

If the retained original is missing, the turn records that the PNG is
unavailable before contacting the provider. Start a new chat and attach
the original PNG again.

You can ask the agent to crop the most recent retained PNG in the chat. It
saves the crop as a working copy in private chat storage. The original and
project files stay intact. The tool returns the copy's identity and dimensions.
Keep the chat state to retain the copy across restarts. If the copy disappears,
the agent reports it as unavailable.

## Run a task from a script

Replace the example paths, endpoint, and model with your selected values.

```sh
printf '%s' 'Explain this concept briefly.' | target/debug/grida-agent run \
  --state-dir /absolute/path/to/agent-state \
  --cwd /absolute/path/to/project \
  --endpoint https://api.openai.com/v1 \
  --model MODEL_ID \
  --credential-env OPENAI_API_KEY
```

The host reads UTF-8 prompt text from stdin. `--prompt` supplies the text as an
argument instead. The input limit is 512 KiB.

Stdout contains JSON Lines. The `accepted` record identifies the chat, turn,
and input. The `finished` record reports the persisted outcome and completion
account. Diagnostics use stderr. Save the accepted identifiers when running
from an automated client.

Pass `--session SESSION_ID` to continue a settled chat with its saved history.
Use its original project directory. For a new input in an idle chat, you can
explicitly choose another authorized model, endpoint or credential, including
a different provider or account. Earlier visible conversation remains
available as portable context; provider-private reasoning and continuation
state do not cross that boundary.

A running or paused turn, queued inputs, an unfinished goal and delegated
work retain their captured model and authority. Restore that connection to
continue them, or resolve the retained work before selecting another for a
new input. Older chats without captured input routes retain their original
execution restrictions. Reopening a chat for inspection starts no model
request.

```sh
target/debug/grida-agent inspect \
  --state-dir /absolute/path/to/agent-state SESSION_ID
```

`--deadline-ms` controls the bounded run deadline and defaults to 120000.
Reaching that deadline after acceptance requests suspension. An interrupt or
termination signal after acceptance requests Stop and reports the recorded
disposition when output remains available.

| Exit code | Result                                                 |
| --------- | ------------------------------------------------------ |
| 0         | Successful task, inspection, or clean service shutdown |
| 1         | Failed request, execution, or output delivery          |
| 4         | Verified suspension                                    |
| 5         | Uncertain execution or unverified shutdown             |
| 6         | Input required with a retained question or approval    |
| 130       | Stopped task or process signal                         |

After an output failure, use the accepted identifiers to inspect retained state.
An uncertain outcome requires reconciliation before repeating effects.

Use `run --questions` for single-question requests with JSON Lines schema
version 1, or `run --questions-v2` for batches with schema version 2. When a
required answer is pending, the process verifies suspension and returns
`input_required` with the session, turn, and pending question identities.
Reopen the session through an ACP client using the same state directory.
Use `questions` and `answer-question` for single questions, or negotiate
`questions-v2` and `answer-question-v2` to list and answer a batch.
[Grida Agent CLI question formats](../cli/agent.md#choose-a-question-format)

If a granted launch profile requires human approval for a tool action, the
same exit code identifies the retained approval. Only a host-authorized
reviewer can answer that approval. A general ACP observer can inspect it.

### Work with selected folders

On macOS and Linux, select a trusted [native permission profile] with
`--permission-profile PATH`. It names a primary directory and any additional
directories. When `grida-agent run` omits `--cwd`, the profile's primary
supplies the working directory. Ask for a file in another directory by its
profile ID, especially when the same relative path exists in both folders.

Set `read: allow` for bounded text reads or `read: ask` to require approval.
A primary directory with unconditional read command access uses commands to
list, search, and read files. The launch profile determines whether commands
can read ordinary files elsewhere on disk. For a narrow read profile, the
host can provide one separately granted text file as input to a confined
command. That read takes the directory ID and relative file path and follows
the directory's approval rule. File-only profiles use file grants for
bounded reads, directory listings, and literal search. A changed profile can
block continuation of a retained task after restart.

A trusted native launcher can opt into review for one configured file read.
Every other action that requires approval still asks. If the review is
interrupted, unavailable, or returns an invalid reply, the approval remains
available for a manual answer. [Configure automatic read review](https://github.com/gridaco/grida/blob/main/crates/grida-agent/README.md#review-one-configured-read)

[native permission profile]: https://github.com/gridaco/grida/tree/main/crates/grida-agent#filesystem-services

### Plan before carrying out a task

In Desktop, add the **Plan** badge with `/plan` or **+ → Plan mode**.
[Decide what the agent may do](./effort-and-goals.md#decide-what-the-agent-may-do)

Use `--mode plan` with `run` or `serve` to investigate and prepare a proposal.
The agent can read permitted material and ask enabled questions. A profile
with a read command grant and native confinement also lets the agent search
or inspect the project with commands in Plan. Working-copy edits, settings
changes through agent tools, and timed wake-ups are unavailable in Plan.

To authorize execution, open the same chat with `--mode act` and submit a new
prompt. Act is the default and still uses your selected permissions. Previously
accepted Plan inputs keep their limits through queue edits and restart. A host
launched in Plan can inspect or stop retained Act work. Continuing that work
requires an Act launch.

### Choose how much effort a task gets

In Desktop, use the **Effort** slider in the model picker.
[Choose how much effort to use](./effort-and-goals.md#choose-how-much-effort-to-use)

For a headless run, `run --effort standard` uses the ordinary task allowance and is the default.
Use `run --effort ultra` when an independent review could help. Ultra gives
the main agent more room to work and can start one separate reviewer while it
continues. When the host is launched with `--reasoning` for a model that
accepts a reasoning level, Ultra also selects the highest level; otherwise the
model keeps its own reasoning. Headless `run` has no option for Low through
Extra high. The reviewer receives a text assignment and does not automatically
receive the parent's chat history. For a new ordinary review, it can inspect the
primary workspace when that folder already permits reading. It does not receive
additional folder grants, command execution, writes, or delegation. A folder
nested within the readable primary workspace remains accessible through it. The agent can collect a verified finding or
see that the review is still pending or uncertain.
The finished record identifies the reviewer and records whether its verified
findings were collected.

Ultra is available in Plan and Act through every supported native model
connection with tool calls. Its reviewer uses the parent's captured
connection and account. The inference-step allowance applies even when a
provider has no supported output-token limit field. For compatible Chat
Completions endpoints, select the field the endpoint accepts using
`--compatible-output-limit-field`; subscription requests keep their restricted
wire format. A step allowance does not cap provider tokens, quota or charges.
Gateway goals can separately enforce a
[spending limit](#set-a-goals-spending-limit).

### Require a completion check

Use `--require-completion-text` on `run` or `serve` to require final answer
text on newly accepted tasks. A blank answer fails the task and the completion
account records the check's decision. Keep the same launch setting when
resuming those tasks. You can still Stop a retained task when the check is
unavailable. The check uses the recorded answer and preserves any work the
agent already completed.

A trusted native permission profile can also set one command to check an Act
turn before it completes. Use a reviewed system executable with a read-only
workspace scope. Set `command.hooksOnly` to `true` in the trusted launch
profile to keep general commands unavailable to the model. A required check
blocks completion when it rejects or fails. An observational check records
its result and leaves the completion decision in place. Resume uses the
selected definition and preserves any uncertain result from an interrupted
command for review. The headless completion account distinguishes a reported
rejection from a command that hit its deadline or output limit.
[Workspace manifest example](https://github.com/gridaco/grida/blob/main/crates/grida-agent/README.md#check-a-workspace-manifest)

## Use your Grida login

On macOS or Linux, the source-built `grida` CLI can run an explicitly selected
Gateway chat model under your existing Grida account. Build with
`cargo build -p grida-cli --locked` and sign in with
`target/debug/grida auth login` if needed. Select a funding organization
with `--org` or `--org-id` when your account has multiple organizations.

```sh
printf '%s' 'Explain this concept briefly.' | target/debug/grida agent run \
  --provider gg --model MODEL_ID --org ORGANIZATION_SLUG \
  --state-dir /absolute/path/to/agent-state --cwd /absolute/path/to/project \
  --no-input
```

On macOS and Linux, add `--input-png FILE` to attach one PNG up to 256 KiB to a
run using the default Gateway model. The selected image is retained with the
chat. Continuing the chat can send that retained image to the same connection
again. Use `--input-file FILE` to attach a file up to 256 KiB for inspection.
Each run accepts one of these attachments.

The final JSON event can include `gateway_billing` with the recorded charge for
each model request. A settled charge is a decimal string in mills, including
`"0"` for a confirmed zero charge. Pending or unavailable evidence means the
final charge is unknown to this run. The command reports the evidence carried
by the response and makes no follow-up billing query.

For an ACP client, use `target/debug/grida agent serve --stdio` with the same
provider, model, organization, and state-directory options. The client supplies
the project directory when opening a session. An eligible future input can use
an explicitly selected connection; accepted work still requires its original
account and organization. Gateway requests use the selected organization's
credits.

The host renews its short-lived Gateway grant before new model work needs it.
Renewal uses the account and organization that opened the host. If that scope
is no longer available, the task reports an authorization failure before
sending the prompt to Gateway. Requests Gateway already accepted can finish
under their original grant.

## Connect an ACP client

Configure the client to launch the executable with these arguments.

```sh
target/debug/grida-agent serve --stdio \
  --state-dir /absolute/path/to/agent-state \
  --endpoint https://api.openai.com/v1 \
  --model MODEL_ID \
  --credential-env OPENAI_API_KEY
```

The host uses stable ACP v1. Its initialization response advertises its available
capabilities. Clients can create and load sessions, submit prompts, receive text
updates, and cancel their active turn. A loaded session replays committed text
before the load response. A prompt response follows its streamed updates and
verified turn outcome.

In Zed, add a custom External Agent with the absolute path to `grida-agent`
as the command and the arguments from the example above. Start a chat from
the Agent Panel's new-thread menu; Grida's replies appear in that thread.
[Zed custom agents](https://zed.dev/docs/ai/external-agents#custom-agents)

Use `session/list` to discover unarchived chats. An absolute `cwd` filters
to one workspace. Hosts supporting `co.grida/session/catalog-query` can also
list the visible chats across their store when you omit `cwd`. Older Grida
hosts require the workspace. Choose a chat and call `session/load` to open
its transcript. [ACP session listing](https://agentclientprotocol.com/protocol/v1/session-list)

On an execution host the default order is newest created. To show recent conversations, negotiate
`co.grida/session/catalog-query` version 1 and pass
`"_meta": {"co.grida/catalogOrder": "messageActivity"}`. A new message can
bring an old chat to the first page. Viewing or renaming a chat preserves its
position. Each row identifies its workspace. Follow `nextCursor` with the
same filter and order, or start a fresh first page to see new activity. A chat
with no recorded message time follows dated chats, including a chat whose
messages all predate message timestamping.

To watch several stores, launch `grida-agent serve-catalog --stdio --catalog-registry <file>`
with a private registry of the workspaces the client may see. The catalog
defaults to message activity order. Negotiate `co.grida/catalog/watch` version 1
and send `_co.grida/catalog/subscribe` with `{}` or a single `cwd`. Once it
succeeds, list the first page. List again on `_co.grida/catalog/changed`,
and resubscribe before listing after a disconnect. This works with Desktop
closed and requires no model credentials. The native reference describes
registry permissions and the WebSocket option.
[Live cross-workspace catalog](https://github.com/gridaco/grida/blob/main/crates/grida-agent/docs/rust-client-protocol.md#live-cross-workspace-catalog)

On a compatible host, a catalog row's `_meta["co.grida/readState"]` tells
whether the latest reply is unread. To acknowledge a displayed reply,
negotiate `co.grida/session/read-state` version 1 and send
`_co.grida/session/read-state` with its workspace `cwd`, `sessionId`,
`action: "acknowledge"`, and the exact `revision` and `replyId` you
displayed. The response is the current read state. Use `action: "markUnread"`
with the same workspace and chat to mark it unread again. Other clients see
the same state after reopening. Either action keeps the chat's place in
Recents.

For a cross-workspace list, identify each row by its `cwd` and `sessionId`.
Read its `co.grida/running` and `co.grida/inputNeeded` flags from the row's
`_meta`. On pages with unique session IDs, supporting hosts also provide
the independent page-level arrays
`co.grida/runningSessionIds` and `co.grida/inputNeededSessionIds` in
`_meta`. A chat can appear in both when an optional question is open during
work. Refresh the visible page to observe changes. An attached side chat
reports its own `current.disposition` and `current.inputNeeded` in the
session snapshot. Clients can include the side chats they own when showing a
parent's activity.

To read the model captured for a main-chat turn, negotiate
`co.grida/session/snapshot` or `co.grida/session/transcript-window` version 1.
Read the optional `modelId` on the snapshot's `current` and `latest` turns, or
on each transcript turn as you page through history. A queued turn keeps the
model captured when its input was accepted. Older turns may lack that evidence.
The same extensions are available through `grida agent serve --stdio`.

Clients that negotiate `co.grida/session/initial-title` version 1 can send
the optional `_meta["co.grida/initialTitle"]` string with a first
`session/prompt`. Acceptance saves the excerpt for workspace listing.
Successful generation can replace it, and a manual rename takes precedence.

Clients can negotiate `co.grida/session/organize` to list archived chats in
the same workspace. For an attached chat, read the current title, archive state,
and revision before renaming, archiving, or restoring. Archiving leaves active
work running. An archived chat can still be loaded by its ID.

On macOS and Linux, private stdio clients can negotiate
`co.grida/session/delete` version 1 to permanently remove an eligible saved
chat. Attach the chat and read both its execution and catalog revisions before
asking for confirmation. The host requires idle work and refuses chats with
pending inputs, unresolved execution, an unfinished Goal, or named
subagents. Deletion also discards the chat's open side chats and removes its
private attachments and unpublished working copies. Authored files, saved exports, and independent
forks stay available. Retry a lost deletion reply with the original request
ID, workspace, and revisions, even if the chat has disappeared from the list.

In Desktop, the chat list, rename, archive and delete are described in
[Return to work and manage chat history](./history.md#reopen-or-organize-a-chat),
and the queue, Steer and Pause in [Guide and interrupt work](./controls.md).

Text and resource-link descriptors are accepted as prompt content. A resource
link supplies context about a resource. File access follows a separately granted
capability.

When a private stdio host advertises `embeddedContext`, send a text request
with one `resource` block containing UTF-8 `text` or standard base64 `blob`.
The host retains up to 256 KiB of supplied bytes for inspection. The URI
provides a display name. The model can request the retained file’s size,
SHA-256, or a UTF-8 excerpt of up to 2 KiB. Send an image or another file in a
separate request. Shared WebSocket clients can send resource links.

Stdio carries newline-delimited protocol frames with a 1 MiB frame limit and at
most 16 unanswered requests per connection. Closing the supervising pipe starts
bounded shutdown and requests suspension of owned work. A later host process can
inspect the retained state.

## Share a local host

A shared host lets independent native clients connect to the same running
service. Create a separate random server token and provide it through the named
environment variable.

```sh
export GRIDA_AGENT_SERVER_TOKEN="$(openssl rand -hex 32)"

target/debug/grida-agent serve \
  --listen ws://127.0.0.1:8765/acp \
  --server-token-env GRIDA_AGENT_SERVER_TOKEN \
  --state-dir /absolute/path/to/agent-state \
  --endpoint https://api.openai.com/v1 \
  --model MODEL_ID \
  --credential-env OPENAI_API_KEY
```

Connect with a WebSocket client that sends the server token in its
`Authorization: Bearer …` upgrade header. The token grants access to this host's
state directory. The listener accepts numeric loopback addresses, the exact
local authority and `/acp` path, and native connections with an absent `Origin`
header.

Share the token only with clients you trust to access this host's saved chats
and configured capabilities. Give each independent principal a separate
process, state directory, listener, token, and provider and workspace grants.
If the host processes need isolation from each other, deploy them with
separate OS identities or equivalent filesystem and network boundaries.

Each WebSocket text message carries one ACP JSON-RPC object. Closing a client
connection detaches its observers while the host continues its accepted work.
Stopping the service requests suspension of the work it owns.

## Run a local external ACP peer

On macOS and Linux, `grida-agent run-external` can give one text request to a
reviewed local ACP peer. The profile grants read-only workspace access and
the native sandbox denies networking. The structured records declare the
peer's scope, Stop behavior, and retained receipt. Use the accepted session
ID with `inspect` to recover the outcome. Each new run starts its own peer
process. [Native launch profile](https://github.com/gridaco/grida/blob/main/crates/grida-agent/README.md#run-a-confined-external-acp-peer)

The `grida agent run-external` command uses the same reviewed profile and
local receipt. [Run a local ACP peer from the CLI](../cli/agent.md#run-a-local-acp-peer)

### Use the Local agent preview in Desktop

Available in the Linux Insiders build. It uses a reviewed local executable and a helper
provisioned by an administrator for the installed build.
[Provision Local agent](https://github.com/gridaco/grida/blob/main/desktop/README.md#provision-local-agent-in-linux-insiders)

Open **Local agent** in the selected workspace, enter one text request, and
select **Run**. The dialog names the reviewed peer and shows its offline,
read-only workspace access. Closing the dialog leaves the run active. Reopen it
to check the retained result or select **Stop** for the current run. If a send
reply is missing, **Retry exact request** keeps the original request identity.
Unverified cleanup blocks a replacement run.

## Run a confined command

Desktop workspace chats on macOS and Linux run commands in a project sandbox
with **Auto** or **Ask for approval**. [Understand agent permissions](./permissions.md)

Headless hosts can run commands on macOS and Linux when the launcher supplies
a reviewed permission profile and native helper. Each command runs through
the user's shell (`sh`, `bash`, `zsh` or `dash`, otherwise `/bin/sh`) with the
selected directory access and a separate temporary scope. The sandbox blocks
direct networking. A launcher that enables scoped approvals can admit one
brokered destination for a finite command after a per-action decision. Explicit
Full access in Act runs commands with ordinary-user filesystem and network
access. Plan uses the launch profile's read scope. Desktop's default scope
includes ordinary files outside the project. Plan commands stay confined,
run offline, end within the call, and can write only to private temporary
storage. [Choose Full access](./permissions.md#choose-full-access)

An Act command that is still running after its short wait, such as a development
server or a watcher, stays with the chat as a numbered process. Later turns of
the same chat read its output, type into it, or interrupt it. Ending a turn,
stopping it, pausing, waiting for approval and restarting the turn leave the
process running. Stopping it, deleting the chat, and shutting the host down
end it; a host that exits ends its processes too. A chat keeps at most 64,
and starting another stops the least recently used one that is not among the
eight most recent.

A private supervising client that negotiates `co.grida/session/processes` can
list an attached chat's processes with `_co.grida/session/processes`, stop
some or all of them with `_co.grida/session/stop-processes`, and receive the
complete list in `session/update` metadata whenever it changes.

When a command needs approval, a negotiated private reviewer can decide the
exact pending invocation. Input to an approved process needs no further
approval. Stop retains the observed outcome and reports uncertainty if the
host cannot verify process cleanup. [Native permission profile](https://github.com/gridaco/grida/blob/main/crates/grida-agent/README.md#filesystem-services)

## Connect a local MCP client

To let another agent use Grida tools over MCP, including the open tabs of a
Desktop workspace, see
[Connect another agent to Grida with MCP](./grida-mcp.md).

Pass `--headless-surface` to `run` or unsupervised `serve --stdio` to offer
the same `surface_open` tool directly, without an MCP connection. It takes a
workspace path beginning with `/` and reports `not_interactive` because no
editor is attached. Messages with the **Plan** badge do not get it, and a
resumed turn keeps the tool set it started with.

## Use tools from a local MCP server

Headless `run` and `serve --stdio` can opt into tools on one trusted
numeric-loopback server using the stateless MCP 2026-07-28 profile. Supply
these options alongside your usual provider, state directory, and model.

```sh
target/debug/grida-agent serve --stdio \
  --state-dir /absolute/path/to/agent-state \
  --endpoint "$GRIDA_AGENT_ENDPOINT" --model "$GRIDA_AGENT_MODEL" \
  --mcp-endpoint http://127.0.0.1:8766/mcp \
  --mcp-token-env GRIDA_OUTBOUND_MCP_TOKEN \
  --mcp-source local --mcp-tool surface_open
```

`--mcp-source` gives the server a short ID of your choice; the model sees each
selected tool as `mcp_<source>_<tool>`. Set the
named environment variable to the server's bearer token. Use a separate
variable from any model credential. Repeat `--mcp-tool` for each tool you trust
the agent to invoke in Act. A Plan-only launch skips discovery. A Plan message
submitted to an Act host has no MCP tools.

On macOS and Linux, a Desktop build started from source or an Insiders build,
on Gateway, can also enable one local server for a selected workspace through
[trusted launch options](https://github.com/gridaco/grida/blob/main/desktop/README.md).
Desktop shows no list of servers or discovery status.
Workspace startup can discover the peer before you select Plan. Only Act can
invoke the allowlisted tools.
An attached workbench in the selected workspace can use its live editor tools
and the allowlisted MCP tools in the same Act turn. The peer receives the
arguments supplied to its own calls.

Plan messages and goals have no MCP tools. A side chat in Act has the same
tools as its parent. Saved work keeps its
original tool connection; restart the host after a lost connection to connect
again. If that connection closes, the turn can still be stopped. A lost reply
after a tool call leaves an uncertain result. Reconcile it before sending new work that would
repeat the effect.

## Assign work to a named subagent

Supported Desktop builds expose read-only subagent activity and conversations.
Named-child controls in this section are available to private ACP clients.
A native host opted in with `--subagents` also offers general model delegation
for ordinary Act turns, independently of Ultra. Ask the main agent to delegate
independent assignments; its workers have separately captured native
capabilities and bounded allowances. The client operations below remain the
manual, inference-only assignment contract.
[Work with subagents](./subagents.md)

Start the host with a direct provider and private stdio.

```sh
target/debug/grida-agent serve --stdio --subagents \
  --state-dir "$GRIDA_AGENT_STATE" \
  --endpoint "$GRIDA_AGENT_ENDPOINT" --model "$GRIDA_AGENT_MODEL" \
  --credential-env OPENAI_API_KEY
```

During initialization, negotiate version 1 for `co.grida/subagent/create`,
`list`, `assign`, `send-message`, `inspect`, `pause`, `resume`, `steer`, `stop`, `resume-queue`,
and `withdraw` separately. Attach to the parent and finish an Act turn.

1. Create the child with a display name, a creation request ID, and an
   allowance of one to eight work turns. Retain the returned child ID.
2. Assign text using the child ID, the settled parent turn ID, and a new
   input ID. The child uses its own conversation history and receives no
   workspace tools. Assign follow-ups with the same child ID and new input
   IDs. They wait in order within the child's remaining allowance.
3. Inspect the child to see its current or latest assignment and its result
   if one is available. Supply a retained input ID to inspect an earlier
   assignment. After restart, attach to the same parent and list its named
   children to recover their IDs.
4. Use Pause to suspend a child turn, Steer to add a correction, and Resume
   to continue it. Stop ends the assignment and holds its queue. Use Resume
   Queue to start the next assignment, or withdraw a queued assignment to
   free its place.

Retry creation or assignment with the same ID and fields to recover its
receipt. New assignments allow up to two generation steps. A continuation
uses the same assignment and its remaining steps. Reserved work still counts
after interruption. Resuming, steering, and assigning new work require the
same verified provider authority.

Send a message with the parent and child IDs and its own input ID to share
information for the next assignment. An idle child stays idle, and a running
child keeps its current assignment. Inspect the message to see whether it is
waiting or which assignment selected it. The delivery receipt records that
selection. Model input is recorded separately on the turn.
See the [native host request fields](https://github.com/gridaco/grida/blob/main/crates/grida-agent/README.md).

## Ask in a temporary side chat

Side chats are available to private stdio ACP clients; in Desktop, `/side`
opens one. [Ask a side question](./history.md#ask-a-side-question)
A chat can have several side chats open at once.

Negotiate version 1 of `co.grida/side-chat/open` and `co.grida/side-chat/close`.
Open takes the `sessionId` of a parent attached on this connection. Each open
forks the parent's committed conversation, the same way a fork does, into a
new temporary session under the parent's model and settings; the parent can keep
working and is not changed. The response returns `sideChatId`,
`parentSessionId`, the parent history basis it copied (`sourceContext`),
whether the parent's model context had been compacted (`compacted`), the
material the portable copy leaves out (`omissions`) and `temporary: true`.
The copy is the parent's complete committed transcript.

Open also takes an optional `requestId` the client chooses. Repeating an open
with the same `requestId` while its side chat is still open returns that side
chat instead of forking another, even when the parent has no room for one
more. A client whose open timed out repeats it with the same `requestId` to
learn which side chat it opened and close it; the same `requestId` with a
different parent returns `side_chat_request_conflict`. After that side chat
closes, the `requestId` opens a new one.

The side chat ID is an ordinary session ID, already attached on this
connection. Submit, prompt, queue, steer, stop, pause and resume it; answer its
questions and approvals; read its snapshot, transcript window and history; and
list or stop its processes, all with the normal session methods. Live updates
arrive as for any attached chat. Its tools and permission rules are the
parent's, so an approval `ask` rule still asks.

Every side turn runs under a side-chat policy, and a boundary message
separates the copied conversation from the side chat's own messages. The
model treats the copy as background, does not continue the parent's work, and
avoids changes unless the person asks for one after the boundary. These limits
steer the model; they do not narrow the parent's permissions. When the copied
conversation is large, automatic compaction summarizes it before the side
chat's first turn; the summary stays before the boundary. A side chat's own
turns are never summarized, and manual compaction is refused.

The copied conversation is model context only. A new side chat starts empty:
its replay, transcript window and history page show nothing, and
`latestAnchor` is `null`. They then show only the side chat's own messages,
and only those can be edited with a revision. The summary of a compacted copy
does not appear in the side chat's transcript either.

A side chat's snapshot includes `side`: its `parentSessionId`,
`temporary: true`, an `unavailable` list and, when available, its current
`title`. An optional `titleGenerationPending: true` marks a title still
being generated. Each listed operation is refused with its code:

| `unavailable` | Refused operation                                                 | Code                               |
| ------------- | ----------------------------------------------------------------- | ---------------------------------- |
| `fork`        | `co.grida/session/fork` and `/fork`                               | `side_chat_fork_unavailable`       |
| `side_chat`   | opening a side chat from the side chat                            | `side_chat_nested_unavailable`     |
| `compaction`  | manual `co.grida/session/compact` and `/compact`                  | `side_chat_compaction_unavailable` |
| `goals`       | `co.grida/goal/start`                                             | `side_chat_goals_unavailable`      |
| `subagents`   | `co.grida/subagent/create`                                        | `side_chat_subagents_unavailable`  |
| `delegation`  | submitting with an effort above Standard                          | `side_chat_delegation_unavailable` |
| `wakeups`     | submitting with `allowWakeups`                                    | `side_chat_wakeups_unavailable`    |
| `catalog`     | catalog entry, organize (rename, archive), delete and its preview | `side_chat_catalog_unavailable`    |

A side chat never appears in `session/list`, the archive list or saved-chat
counts. When the host is launched with chat titles, it titles a side chat from
its first message the same way it titles a chat; read the title from the
snapshot, because the catalog entry stays refused and a side chat cannot be
renamed. The title ends with the side chat. Another connection cannot load it
(`side_chat_unavailable`). Close takes `sideChatId`, cancels any running turn,
stops its processes and removes its data; a closed or unknown ID returns
`side_chat_unavailable`. If cleanup cannot be confirmed the close fails with
`side_chat_discard_pending` and can be retried; a retry that returns
`side_chat_unavailable` means an earlier close finished. Deleting the parent
also discards all of its side chats, which are then no longer attached; a side
chat that opens while its parent is deleted is discarded with it, or the open
finds no parent. Closing the
connection discards every side chat, and a host discards any side chat a
crash left behind before it serves. A parent can have eight side chats open
(`side_chat_parent_limit`) and one connection thirty-two across its parents
(`side_chat_scope_limit`); closing one makes room. Bringing an answer into the
parent is up to the client.

## Set context size and compaction

Agent context settings come from the user-wide `~/.grida/config.toml`.
Set an absolute `GRIDA_HOME` to use a different Grida home. Edits take effect
at startup. [Change agent settings](./settings.md)

A trusted ACP client can negotiate inspection and reload of the active model
window and compaction threshold. [Agent configuration](../reference/agent-configuration.md#client-operations)

## Attach a PNG to a message

In Desktop, choose **+ → Image** or drop or paste a PNG.
[Attach an image](./getting-started.md#attach-an-image)

On macOS and Linux, a source-built `grida-agent run` can take one local PNG
through `--input-png` on a compatible image profile. Omit `--cwd` and
`--permission-profile` to process the image without a project. Direct Google
Gemini `gemini-3.8-flash` also supports PNG prompts on this host. Image edits
use a saved working copy. [Run locally with a PNG](https://github.com/gridaco/grida/blob/main/crates/grida-agent/README.md#run-locally)

Desktop supports PNG, JPEG, WebP and GIF on a connection that advertises image
input, including compatible ChatGPT subscription models. It sends prepared
pixels in the first request and includes a verified original path for disk
images. A clipboard image without a disk origin is identified as a retained
snapshot. Original sources are retained separately from the bounded model
image. Unsupported image input preserves the entire draft before submission.

Private clients can negotiate the selected-image protocol for this raster
workflow. The inline PNG and headless `--input-png` interfaces above retain
their existing 256 KiB bounds; they are separate from the richer selected-image
custody contract. [Native image protocol](https://github.com/gridaco/grida/blob/main/crates/grida-agent/docs/rust-client-protocol.md)

Sent attachments render outside the message's text bubble. Supported images
show just the image, without a card frame, filename or dimensions caption;
files, folders and videos keep individual cards. A compatible Desktop build
reads the exact retained raster original from its owning chat for image
preview, also after reopening; older builds keep the named card.
Referenced videos can retain bounded still previews. Enlarging a
video's still does not play the clip. PDF, SVG and HTML attachments keep file
cards. These display choices do not alter model input or filesystem grants.
[Inspect an attachment](./results.md#inspect-an-attachment)

## Attach a file for inspection

In Desktop, choose **+ → Files** or drop or paste a file.
[Attach a file](./getting-started.md#attach-a-file)

Disk files are references, including small text files. The model receives the
verified source path and facts, and content inspection happens on demand under
existing permissions. No-origin ordinary files can use the bounded retained
file workflow when available; no original disk path is invented.

Drop a folder from the operating system to attach it by reference. The model
receives its location and directory type, with no total size, preview or
copied contents. Folder references follow the same single-attachment,
queue and saved-message ownership as other attachments. Viewing the retained
message starts no file read or model request.
[Attach a folder](./getting-started.md#attach-a-folder)

A private native client represents a folder with the existing local resource
link, a canonical file URI and the `inode/directory` media type, omitting size
and preview. The reference adds no filesystem grant. Plan commands inspect
folders under their confined read scope. Act uses its existing command scope.
Desktop Main validates the actual dropped directory
and refuses protected directories, containing ancestors and canonical aliases.
An older Desktop host without folder-reference support refuses the drop
before submission and preserves the draft and current attachment.

## Inspect a local file headlessly

On macOS and Linux, `grida-agent run --input-file FILE` accepts one selected
regular file up to 256 KiB, including without a project. The task can verify
its size and digest and request a short text excerpt. Binary files provide
integrity metadata. The original and private working copy stay with the chat.
Reopening preserves the same file or identifies which copy is unavailable.
[Run with a selected file](https://github.com/gridaco/grida/blob/main/crates/grida-agent/README.md#run-locally)

## View a workspace PNG headlessly

PNG, JPEG, WebP and GIF can be inspected through `view_image` on a connection
that supports image-bearing tool results. Use a trusted workspace permission
profile and name the file by its relative path; include its directory ID when
outside the primary folder. A read that requires approval still requires it.

The tool decodes and prepares a bounded PNG, using the same source and image
limits as selected raster attachments. The next model request receives actual
pixels with the corresponding tool result. A resized image or one still frame
does not establish original-resolution or full-animation inspection. Inspecting
a path confers no write or additional directory permission.

Subscription Responses, supported Responses API, compatible/OpenRouter and
Gateway routes can offer this tool when they implement image-bearing tool
results. A model that accepts a user image need not support tool images: the
current direct Gemini image profile accepts user images but does not offer
`view_image`. SVG, HTML, PDF and document rendering remain separate workflows.
Already accepted work keeps its captured vision-tool version and limits after
an update. A new message can use the expanded raster tool.
[Work with selected folders](#work-with-selected-folders)

## Read a finished turn

In Desktop, a finished turn folds its work under a **Worked for …** header.
[Read what a turn did](./results.md#read-what-a-turn-did)

Native clients read the same record through the turn summary operation. The
host records reported tokens, completion checks and Gateway charges with each
turn; Desktop does not show them in the chat.
[Use durable client operations](#use-durable-client-operations)

## Follow a provider retry

The native host can make one more attempt with the same model and connection
after a verified rate-limit rejection with a short delay. A direct HTTP
connection refusal can also get one retry when the host can prove the
generation request was never sent. The turn stays running while it waits.
Pause or Stop still apply, and clients can read the retry time from the
session snapshot.

When the result is uncertain, review any partial work before trying again.
You can send a new message in the same chat after the failed turn. To use a
different provider, choose another model for the next turn.

## Use durable client operations

A capable client can opt in to individual version-1 operations through
`clientCapabilities._meta` during initialization. The host advertises the same
keys in `agentCapabilities._meta`. A custom method adds `_` before its capability
key, such as `_co.grida/session/snapshot`.
Each suffix in a grouped row uses the displayed prefix and is negotiated separately.

| Capability key                                                                             | Operation                                                                                                 |
| ------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------- |
| `co.grida/session/submit`                                                                  | Accept a prompt for an idle session under a client-chosen input ID.                                       |
| `co.grida/session/snapshot`                                                                | Read revisions, waiting inputs in order, and the current or latest turn.                                  |
| `co.grida/session/model-change`                                                            | Inspect connection-change blockers or prepare an idle worker for replacement, over private stdio only.    |
| `co.grida/session/enqueue`, `input`                                                        | Queue a prompt and read its retained content, settings, and disposition.                                  |
| `co.grida/session/replace`, `withdraw`, `reorder`                                          | Edit waiting inputs using the current queue revision.                                                     |
| `co.grida/session/pause`, `resume`, `steer`                                                | Pause a turn, resume its verified suspension, or send a correction to that turn.                          |
| `co.grida/session/stop`, `resume-queue`                                                    | Stop a turn and pause queue advancement, then reopen queue admission when ready.                          |
| `co.grida/session/questions`, `answer-question`                                            | Inspect pending questions and submit a correlated choice, free-text answer, or skip.                      |
| `co.grida/session/questions-v2`, `answer-question-v2`                                      | Inspect and answer a batch of one to three questions with one correlated submission.                      |
| `co.grida/session/approvals`, `answer-approval`                                            | Inspect requests for additional access and decide each exact action.                                      |
| `co.grida/session/history`, `fork`, `revise`                                               | Browse retained message anchors, branch a chat, or replace an earlier text message.                       |
| `co.grida/session/compact`                                                                 | Summarize earlier model context and keep the original transcript available.                               |
| `co.grida/session/skills`                                                                  | List available skills for this chat and select a versioned reference for a prompt.                        |
| `co.grida/config/inspect`, `reload`                                                        | Inspect or reload the user-wide agent settings.                                                           |
| `co.grida/session/wakeups`, `cancel-wakeup`, `recover-wakeup`, `continue-cancelled-wakeup` | Allow one check-in on an Act submission or goal start, then inspect, cancel, restore or continue past it. |
| `co.grida/session/processes`                                                               | List a chat's long-running command processes, stop them, and receive the list when it changes.            |

Use ordinary `session/prompt` for a streamed reply. Use durable submission or
enqueue when your client needs acceptance separately from completion. Give each
input one stable identity. A retry with the same prompt returns its retained
position and disposition. A replacement gets a new input ID and keeps the
original queue slot.

Pause acknowledges the request first. Inspect the turn for confirmed
suspension. Resume uses that turn's current revision and preserves its
accepted settings. A changed provider credential can make the retained task
unavailable for resumption. Stop pauses queue advancement, which you can
reopen separately with Resume Queue. Opening a session after restart only
loads its retained state. An ACP client that saved a Resume Queue request ID
can retry it to recover the same unchanged queue; the retry does not start
later inputs added after that decision.

### Prepare a model connection change

A supervising private stdio client can negotiate
`co.grida/session/model-change` version 1. Call
`_co.grida/session/model-change` with `{ "sessionId": "SESSION_ID" }` to
inspect one attached chat, or `{}` to inspect every chat in the worker's
store. A clear response has no `blocker`. A blocker identifies pending
admission, an active or retained turn, queued input, an unfinished goal,
a temporary side chat, delegated work or a background process. Inspection
starts no model request, changes no connection and supplies no credential or
account identity.

Before replacing a worker, call the same method with `{ "prepare": true }`
and no session ID. A `{ "prepared": true }` response seals that worker's
admission after checking its retained work. Close it and open the replacement
under the explicitly selected connection. Preparation is terminal: if the
replacement fails, restore the previous connection in a new worker. A clear
inspection alone cannot authorize replacement because work may have arrived
since that read. If the capability is absent, report that connection changes
need a compatible host; do not send the unsupported method or silently stop
the previous worker.

Negotiate `co.grida/session/turn-summary` to read a settled turn by its
`sessionId` and `turnId`. The response reports the retained answer or a status
fallback, recorded tool dispositions, unresolved operations, and any completion
checks. The same record is available after reopening the chat.

Negotiate both v2 question operations to enable batches for new inputs. A batch
answer supplies one choice, free-text answer, or skip for each item ID. Its
answers commit together. Clients negotiating only the original pair can still
receive and answer single questions. The v2 list preserves the original shape of
retained singleton waits.
An answer can resume suspended work when its other conditions allow execution.
An explicit Pause remains effective after the answer. Question negotiation does
not add image or file-input capabilities; clients keep the input profile their
host advertises.

A host operator can enable native workspace tools with a trusted
`--permission-profile` on macOS or Linux. The profile selects named directories,
allowed operations, and which actions require review. Only a private
supervising stdio client can approve once or decline. A shared WebSocket
client can inspect pending requests. Restarting the host cannot grant access
to a changed directory or executable.

Select a named skill with `run --skill NAME` or through the ACP skill catalog.
Repeat the flag to select more than one. Bundled skills include `dotcanvas`,
`slides`, and `svg`. On Unix, a local run can also use skills in its selected
project. An ACP host must explicitly allow reads from the primary project
directory. Project skills take precedence for bare names. An eligible
extension skill can also be selected by its full `extension/skill` name.
ACP clients can use the versioned URI returned by the catalog.

With a permission profile, the agent also sees each available skill's name
and description and reads one when the request calls for it, without a
selection.

An accepted prompt keeps the skill and project instruction versions it used.
Changes on disk apply to later prompts. If a saved skill selection has changed,
refresh the catalog and select it again. Skills guide the task within its
existing permissions.

Configuration changes apply to later accepted inputs. Existing inputs retain
their captured defaults. The model window and automatic compaction threshold
guide when the agent summarizes earlier context. [Agent configuration](../reference/agent-configuration.md).

### Use a chat command

An ACP client can send `/compact` as the entire prompt. For the commands
Desktop offers, see [Use a chat command](./skills-and-tools.md#use-a-chat-command).

### Branch or revise a chat

In Desktop, use `/fork` to [try a different direction](./history.md#try-a-different-direction).
To revise a sent message, hover over it and choose **Edit and resubmit**. The
message becomes a multiline editor in its original place in the conversation.
Choose **Cancel** to restore the original bubble or **Send** to resubmit the
replacement. Enter sends the edit; Shift+Enter inserts a new line. Your unsent
composer draft stays in place.

Editing is available for retained text messages without attachments, in an idle
chat with an empty queue and a resolved Goal. A message that started a Goal
cannot be edited. While sending the edit, its text and Cancel action are locked.
If the reply cannot be confirmed, **Retry edit** checks the same request; keep
using that action until the outcome is known. The host keeps the view an edit
replaced; ACP history can read it, and Desktop does not show it.

Read a history page to select a committed message and its basis. A fork creates
a separate chat from that prefix while the source can continue running. Open
the new chat to send its first prompt. The copied context includes portable text
and reports omitted media, tool material, and provider continuation.

Revising an earlier text message requires an idle chat and an empty queue. The
host saves the previous view and accepts the replacement with fresh input
settings and permissions. A paused queue still needs Resume Queue. Use the
document or file owner's editing controls to undo changes made during earlier
work. The history operations retain evidence of those earlier effects.

### Compact model context

An ACP client that negotiates compaction can send `/compact` as the entire
prompt or call the identified compaction operation. Start from an idle chat
with an open, empty queue. The summary uses the selected model. New prompts
can enter the queue while it runs.

For ordinary **Plan** or **Act** text, the native host can summarize a large earlier part
of the conversation before starting an accepted queued message or an
identified submit. An identified submit reports the same accepted input as
queued while the summary runs. The host keeps the most recent turn verbatim
and preserves queue order and input settings. If the summary attempt fails,
work can continue with the previous context. Standard ACP `session/prompt`
still waits for its user turn to finish. Automatic compaction uses a
compatible provider measurement and estimates the context that measurement
didn't cover. During a turn it can also summarize earlier completed tool
exchanges while retaining the current user messages and later exchanges.
A provider's explicit context-limit result can also trigger compaction before
the next eligible message on the same connection and model. The failed turn
remains in the transcript and is not replayed. The provider can still report a
context limit on a later request. Both forms of compaction preserve the
visible transcript.

After a successful compaction, future model requests use the summary and any
turns it did not cover. If the history is too large for one summary request,
the host summarizes complete early turns and keeps the later turns verbatim.
You can compact again to cover more of the conversation. The original
transcript remains available. If compaction fails or its result is uncertain,
the host keeps the previous context. Pause and Stop apply while the summary
runs. An identified request can inspect the retained attempt after reconnecting.

For a history too large to load as one context, manual compaction can summarize
a bounded prefix while keeping later complete turns. More than one compaction
may be needed before another message fits. Resolve or remove queued input first;
the command requires an idle chat with an empty queue. If an individual turn or
the retained history exceeds the recovery limits, compaction reports an error
and leaves the transcript available.

### Work toward a persistent goal

In Desktop, start a goal with `/goal` or **+ → Goal**.
[Keep an objective across turns](./effort-and-goals.md#keep-an-objective-across-turns)

Clients can set separate success criteria, allowances, manual continuation,
named reviewers, a spending limit and a check-in through the goal protocol.
Supply an objective and its success criteria. A goal started while the agent
works, or while messages wait, joins the queue and begins when its turn comes;
until then the queue shows it as a goal. A chat holds one goal at a time, so
a second start is refused while a goal is set or waiting to start. Separate allowances for work turns and inference steps are
optional; without them the goal gets eight work turns and 64 inference steps.
Opt in to automatic continuation when you start the goal. The next reserved
turn follows any prompts already in the queue. The agent waits if it needs
input, runs out of allowance, or records no further progress.
Without that opt-in, the goal reserves its first work turn only. An explicit
Resume can authorize one more work turn within the remaining allowance; it does
not turn on automatic continuation. Earlier queued messages go first. For a
manual goal started elsewhere, Desktop's **Resume goal** continues one more
turn.

Inspect the goal to see progress, allowance used and held, and any blocker.
Pause and Resume preserve the allowance for the same suspended turn. Revising
the objective or clearing the goal stops its current work. The prior turn's
evidence and uncertainty remain available.

When the agent proposes that the goal is complete, inspect the proposed result
against the success criteria and confirm completion if the work meets them.
The goal records your confirmation and keeps its used allowance. You can
confirm after the work settles even if no allowance remains. The proposal
stays tied to the work it came from, including after reopening the chat.

A trusted headless launch can independently verify configured file criteria
from the complete bytes recorded by `read_file`. The goal retains the exact
verification from that turn. [Configure observed-file criteria](https://github.com/gridaco/grida/blob/main/crates/grida-agent/README.md#verify-a-goals-observed-file-bytes)

A private ACP client can select **Ultra** for a goal. One independent review
shares its inference allowance. Later automatic work proceeds directly if only
one or two steps remain. Use the task's Pause, Resume or Stop while the funded
turn is active. If the review finishes later, use the negotiated
reconciliation control to account for its settled steps, then resume the goal
explicitly.

Clear an active or blocked goal before replacing an earlier message in the
same chat. A fork starts independently.

After a host restart, inspect the goal and its latest turn. An ACP client can
use Recover to reconsider eligible work under the original allowance and
authorization. Work with an interrupted dispatch remains recorded against its
existing turn.

Private ACP clients can allow one check-in when starting a goal without
**Ultra** in Act. The check-in waits within the first reserved turn and uses
its remaining inference allowance. After reopening, restore the schedule and
resume the goal if it is paused. A cancelled check-in needs explicit
continuation. Later automatic goal turns receive their own permissions.
[Schedule a follow-up](./scheduled-work.md)

Negotiate the version-1 capabilities `co.grida/goal/start`, `co.grida/goal/inspect`,
`co.grida/goal/control`, and `co.grida/goal/recover` for these operations.
`co.grida/goal/manual-continuation` additionally identifies support for one-turn
manual continuation and reports when that continuation is queued.
The [client protocol reference](https://github.com/gridaco/grida/blob/main/crates/grida-agent/docs/rust-client-protocol.md#persistent-goal-operations)
lists their parameters.

### Set a goal's spending limit

A client starting a goal on a Grida Gateway connection can set a spending
limit: the total amount you authorize for that goal. Desktop does not offer
one. Your own keys, custom endpoints and subscription connections have no
spending limit; their step allowances still apply.

- The goal and any subagent work it funds share the one limit. Each paid
  request has its own ceiling, the total divided by the inference-step
  allowance, so a large request can exceed its share even when the goal has
  more left. Choose the limit and the step allowance together. A goal with a
  spending limit allows at most 4,096 inference steps.
- Paid media and external tools are unavailable to a goal with a spending
  limit.
- Inspecting the goal shows charged, held and available amounts separately.
  An interrupted request or a pending billing record keeps its hold until its
  charge is known. Refreshing billing can settle that request; it does not
  repeat work or refund an unknown outcome.
- Pause, restart, retry and objective edits keep the same limit. Deleting a
  subagent does not reset it.
- Changing connections keeps the old goal's recorded spending intact. An
  exact retry of its start observes the original acceptance and allocates no
  new budget. A new goal uses its explicitly selected connection; refreshing
  an old request's billing still requires its original Gateway account and
  organization.
- The service must support capped requests. If it does not, the request fails
  rather than running without the limit. The amount is exact; a value with
  unsupported precision is rejected rather than rounded.

### Ask the agent to check later

Negotiate `co.grida/session/wakeups`, `cancel-wakeup` and `recover-wakeup`
together, then set `allowWakeups` on a single Act submission to allow one
check-in. `continue-cancelled-wakeup` lets the client continue a task after
cancelling its check-in. The client can inspect the retained time,
reason, status, and whether the host has armed the timer. It can cancel the
wait, explicitly continue the task, or restore its schedule after restart.
Desktop chat does not offer check-ins.
[Schedule a follow-up](./scheduled-work.md)

The [feature catalog](./features.md) describes the wider agent experience and
the availability of its product features.
