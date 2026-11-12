---
title: Connect an agent client
description: Run Grida Agent headlessly or connect an Agent Client Protocol client to its native host.
keywords: [agent, headless, ACP, automation, native host]
doc_tasks: [enhance]
format: md
---

# Connect an agent client

The native Grida Agent host runs tasks from scripts and serves Agent Client
Protocol (ACP) clients. Its entrypoints use the same conversation master and
durable session store. The native executable is available from source.

## Use native chat in Desktop

Current macOS and Linux Desktop source selects the native host for Stable,
Insiders and development. Open a project or deck and start a new chat. macOS also supports
standalone SVG chat. Model selection, questions, queued input and history use the same
native session service as headless clients. Availability still depends on the
selected connection and the capabilities shown in that chat.

Previous chats and their uploaded inputs remain in their original storage.
New native chats start with fresh history. Closing or restarting Desktop keeps
those new chats; reopening one does not submit another model request. A host
startup failure reports unavailable chat rather than selecting another engine.

Windows currently retains file and media workflows with chat unavailable.
The optimized macOS Apple Silicon candidate has packaged process evidence.
The headless host has bounded live OpenRouter `openai/gpt-4.1-mini` text and file-read checks.
The native Linux ARM64 host and retained Desktop service also have isolated
kernel, process and restart checks. Other live providers, full Linux installer
delivery, other architectures and signed delivery remain unqualified.

For development, start the local editor and its local authentication services
before starting the Desktop shell. See the
[authenticated local setup](https://github.com/gridaco/grida/blob/main/CONTRIBUTING.md#authenticated-local-development).
The Desktop development command prepares the native worker and helper before
launch. A missing default Gateway connection can be recovered through explicit
[model selection](./models-and-usage.md#choose-a-model).

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

On macOS and Linux, private stdio ACP with `--provider responses --model gpt-5.4`
also accepts one inline PNG up to 256 KiB per input. Supply the PNG bytes in
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
Use its original project directory and provider settings. Reopening a chat for
inspection starts no model request.

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

Use `run --questions` to enable structured questions in an embedded run. When
an answer is needed, the process verifies suspension and returns `input_required`
with the session, turn, and pending question identities. A capable service client
can answer the retained question through the same state directory.

If a granted launch profile requires human approval for a tool action, the
same exit code identifies the retained approval. Only a host-authorized
reviewer can answer that approval. A general ACP observer can inspect it.

### Work with selected folders

On macOS and Linux, select a trusted [native permission profile] with
`--permission-profile PATH`. It names a primary directory and any additional
directories. When `grida-agent run` omits `--cwd`, the profile's primary
supplies the working directory. Ask for a file in another directory by its
profile ID, especially when the same relative path exists in both folders.

Set `read: allow` for bounded text reads, directory listings, and literal
search, or `read: ask` to require approval. Listing a folder in the profile
does not grant access by itself. A changed profile can block continuation
of a retained task after restart.

A trusted native launcher can opt into review for one configured file read.
Every other action that requires approval still asks. If the review is
interrupted, unavailable, or returns an invalid reply, the approval remains
available for a manual answer. [Configure automatic read review](https://github.com/gridaco/grida/blob/main/crates/grida-agent/README.md#review-one-configured-read)

[native permission profile]: https://github.com/gridaco/grida/tree/main/crates/grida-agent#filesystem-services

### Plan before carrying out a task

In the native Desktop workspace pane, select `/plan` in the composer to add
planning instructions to the next message. Selection preserves the draft and
starts no work. The removable **Plan** badge applies to messages you send or
queue. Steering a queued message into the current turn keeps that turn's accepted instructions. To
carry out a proposal, remove the badge and send a new request in the same chat.
Planning does not change the chat’s permissions or effort.

Use `--mode plan` with `run` or `serve` to investigate and prepare a proposal.
The agent can read permitted material and ask enabled questions. Commands,
working-copy edits, settings changes through agent tools, and timed wake-ups
are unavailable in Plan.

To authorize execution, open the same chat with `--mode act` and submit a new
prompt. Act is the default and still uses your selected permissions. Previously
accepted Plan inputs keep their limits through queue edits and restart. A host
launched in Plan can inspect or stop retained Act work. Continuing that work
requires an Act launch.

### Choose how much effort a task gets

In a supported Gateway, saved OpenRouter, or saved Vercel chat in Desktop, choose **Standard** or **Ultra** in
the model picker at the bottom of the composer. You can use either with **Plan** or **Act**. The
choice applies when you send or queue a message. Steering keeps the current
turn's effort. Editing a queued or earlier message keeps its original effort.
Resubmitting an earlier Ultra message requires a connection that supports Ultra.

`run --effort standard` uses the ordinary task allowance and is the default.
Use `run --effort ultra` when an independent review could help. Ultra gives
the main agent more room to work and can start one separate reviewer while it
continues. The reviewer receives a text assignment and does not automatically
receive the parent's chat history. For a new ordinary review, it can inspect the
primary workspace when that folder already permits reading. It does not receive
additional folder grants, command execution, writes, or delegation. A folder
nested within the readable primary workspace remains accessible through it. The agent can collect a verified finding or
see that the review is still pending or uncertain.
The finished record identifies the reviewer and records whether its verified
findings were collected.

Ultra is available in Plan and Act on the source-built host. It requires a
model with JSON tool calls and a provider that supports a bounded output.
For compatible Chat Completions endpoints, select the output limit field the
endpoint accepts using `--compatible-output-limit-field`.

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
the project directory when opening a session. Keep the same model, account, and
organization to continue a saved chat. Gateway requests use the selected
organization's credits.

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
the Agent Panel's new-thread menu. Zed 1.21.0 on macOS was verified opening a
session and displaying a completed text reply through ACP stdio. [Zed custom agents](https://zed.dev/docs/ai/external-agents#custom-agents)

Use `session/list` to discover unarchived chats for an absolute workspace `cwd`.
Follow `nextCursor` with the same workspace to get the next page. The list
shows chat identities and optional titles in newest-created order. Choose a
chat and call `session/load` to open its transcript. [ACP session listing](https://agentclientprotocol.com/protocol/v1/session-list)

Clients can negotiate `co.grida/session/organize` to list archived chats in
the same workspace. For an attached chat, read the current title, archive state,
and revision before renaming, archiving, or restoring. Archiving leaves active
work running. An archived chat can still be loaded by its ID.

On macOS and Linux, private stdio clients can negotiate
`co.grida/session/delete` version 1 to permanently remove an eligible saved
chat. Attach the chat and read both its execution and catalog revisions before
asking for confirmation. The host requires idle work and refuses chats with
pending inputs, unresolved execution, an open side chat, an unfinished Goal,
or named subagents. Deletion also removes the chat's private attachments
and unpublished working copies. Authored files, saved exports, and independent
forks stay available. Retry a lost deletion reply with the original request
ID, workspace, and revisions, even if the chat has disappeared from the list.

When a native chat owner is active in Desktop, the chat list at the top left
shows saved chats in that workspace. Use **Older chats** to browse further or
**Archived chats** to find an archived chat. Selecting a chat opens its transcript.
With a chat open, use **Chat options → Rename chat** and save the title. Clear the title to
use the default name. Choose **Archive chat** to move it out of the active list
while keeping its draft and any running work. Open it from **Archived chats**
and choose **Restore chat** to return it to the active list.

On macOS and Linux, select an eligible idle chat and choose **Delete chat**.
Confirm in the Desktop dialog to remove the conversation and its private
attachments and working copies. Desktop closes the deleted chat in any open
workspace window. Project files, saved exports, and independent forks stay
available. On supported connections, the dialog shows how many owned named
subagents will be deleted with the chat.
Running, paused, queued, or unresolved work blocks deletion. You can archive
a chat while its work continues.

With the native **Ask me** profile, a read outside the current grants pauses
for review when its folder is eligible for additional access. The pane shows
the requested action and target. **Allow once** authorizes that action.
**Decline** leaves the additional access denied.

Answer a question in its card by selecting a choice, writing a reply, or
skipping. The agent may continue other work while it waits. A separate message
sent from the composer joins the queue and leaves the question open.

While a turn is active, the native workspace composer queues text as a
follow-up. You can edit, move, or remove waiting messages. Choose **Steer**
on a waiting message when it should guide that turn at its next decision. If
the turn cannot accept it, the text returns to the composer.
**Stop** holds the queue. Choose **Resume** on the queue to let waiting messages run.

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

The installed Linux Insiders preview has been verified on Debian ARM64.

The Linux Insiders preview uses a reviewed local executable and a helper
provisioned by an administrator for the installed build.
[Provision Local agent](https://github.com/gridaco/grida/blob/main/desktop/README.md#provision-local-agent-in-linux-insiders)

Open **Local agent** in the selected workspace, enter one text request, and
select **Run**. The dialog names the reviewed peer and shows its offline,
read-only workspace access. Closing the dialog leaves the run active. Reopen it
to check the retained result or select **Stop** for the current run. If a send
reply is missing, **Retry exact request** keeps the original request identity.
Unverified cleanup blocks a replacement run.

## Run a confined command

Source-built native hosts can run finite commands on macOS and Linux when
the launcher supplies a reviewed permission profile and native helper.
The command runs with the selected directory access and a separate temporary
scope. Network access is denied. Plan keeps the command tool unavailable.

When a command needs approval, a negotiated private reviewer can decide the
exact pending invocation. Stop retains the observed outcome and reports
uncertainty if the host cannot verify process cleanup. [Native permission profile](https://github.com/gridaco/grida/blob/main/crates/grida-agent/README.md#filesystem-services)

## Connect a local MCP client

The standalone tool host serves MCP without opening a chat or contacting a
model provider. Generate a separate local token and launch the tool host.

```sh
export GRIDA_MCP_SERVER_TOKEN="$(openssl rand -hex 32)"

target/debug/grida-agent serve-mcp \
  --listen http://127.0.0.1:8766/mcp \
  --server-token-env GRIDA_MCP_SERVER_TOKEN
```

Configure your client for Streamable HTTP at the same address and send the
token in an `Authorization: Bearer …` header. The service accepts native
clients on the exact numeric loopback address. It supports MCP revisions
2026-07-28 and 2025-11-25.

The headless service offers `surface_open`. Its result reports that no
presentation was requested because no editor is attached.
Pass `--headless-surface` to native `run` or unsupervised `serve --stdio`
to offer the same operation directly in Act. It takes the same workspace
artifact path and returns the same outcome without an MCP connection.
Plan leaves it unavailable. A resumed turn requires its captured tool set.

### Read the live Desktop workbench

An explicitly enabled disposable Desktop launch can export `surface_list_open`
for one workspace. It returns the active file and bounded open-tab list as
workspace-relative paths. The service runs independently of the built-in chat.
Connect with the same Streamable HTTP authentication described above, using
the dedicated export bearer. [Desktop launch options](https://github.com/gridaco/grida/blob/main/desktop/README.md)

An attached workbench with no files open returns an empty view. Before the
selected frame publishes, or after it navigates or closes, the endpoint reports
that the workbench is unavailable. Start a new explicit export to select a
replacement frame.

## Use tools from a local MCP server

Source-built `run` and `serve --stdio` can opt into tools on one trusted
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

Set the named environment variable to the server's bearer token. Use a separate
variable from any model credential. Repeat `--mcp-tool` for each tool you trust
the agent to invoke in Act. A Plan-only launch skips discovery. A Plan message
submitted to an Act host has no MCP tools.

The disposable Desktop Gateway profile can also enable one local peer for a
selected workspace through [trusted launch options](https://github.com/gridaco/grida/blob/main/desktop/README.md).
Workspace startup can discover the peer before you select Plan. Only Act can
invoke the allowlisted tools.
An attached workbench in the selected workspace can use its live editor tools
and the allowlisted MCP tools in the same Act turn. The peer receives the
arguments supplied to its own calls.

Retained work keeps its original tool connection. If that connection closes,
Stop is still available for a suspended turn. A lost reply after a tool call
leaves an uncertain result. Reconcile it before sending new work that would
repeat the effect.

## Assign work to a named subagent

For the Desktop workflow, see [Work with subagents](./subagents.md).

Start the source-built host with a direct provider and private stdio.

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

Desktop chat no longer offers a side chat; ACP clients can still open one. In a client that offers it, ask in its separate
text composer while the parent continues. Closing the pane or switching
parent chats discards the side conversation.

Choose **Add to parent draft** under a completed answer to append a labeled
quote to your unsent message. Long answers contribute a marked excerpt.
The draft stays editable and remains in the parent composer after closing
the side chat. Send the draft when ready.

A private stdio client can open a read-only side chat from an attached parent.
It captures committed background, including an installed summary when present.
The parent can keep working. The selected model treats that snapshot as quoted
reference and answers the side chat's new questions. The open response identifies
the source context and reports omitted material.

Side chats accept up to six text questions and use the host's selected model.
They have no workspace tools or scheduled work. Close ends that side chat and discards its conversation.
A disconnect also discards it. The parent keeps its own history and controls.

Negotiate version 1 for `co.grida/side-chat/open`, `ask`, and `close` separately.
Open supplies the parent session and a request ID. Ask supplies the returned side
chat ID, a request ID, and text, and returns a completion account. Close supplies
the side chat ID. These IDs work only on the connection that opened the chat.

## Set the context input limit

Open **Context limit** in the native Desktop workspace chat to see its current
default. A provider that supports exact request counting can use a custom token
limit. Choose **Save limit** and confirm the value. The new default applies to
future accepted messages. Work already accepted keeps its captured setting.
The current Gateway and ChatGPT subscription profiles can inspect the limit
and return an existing valid override to **Automatic**.

To ask the agent to change the default with a compatible provider, remove the **Plan** badge and enable
**Review settings permission on next Act send** in **Workspace settings…** (chat options menu). Write a short
message and confirm it when Desktop asks. That permission covers the context
input limit for this message. To change a queued message with this permission,
withdraw it and review a new send.

## Attach a PNG to a message

When the native Desktop chat advertises image input, choose **Add PNG** or
drop or paste one PNG up to 256 KiB into the composer. Write a message before
sending. The text and image enter the chat together, including when the message joins the
queue. A replacement uses the selected file even when its name matches. If
the file cannot be read or the connection cannot use PNG input, Grida keeps
your draft and blocks the send. Replace or remove the PNG, or use a compatible
connection. Retrying an unconfirmed send with the same draft keeps the original
input identity. To change a queued image, remove the queued message and submit
a new one.

On macOS and Linux, a source-built `grida-agent run` can take one local PNG
through `--input-png` on a compatible image profile. Omit the workspace
directory and permission profile to process the image without a project.
Direct Google Gemini `gemini-3.8-flash` also supports PNG prompts on this host.
Image edits use a retained working copy. [Run locally with a PNG](https://github.com/gridaco/grida/blob/main/crates/grida-agent/README.md#run-locally)

On macOS and Linux, the isolated native Desktop preview supports PNG input
with **GPT-5.6 Terra** and a saved OpenRouter key. Select it at launch with
`--native-chat-provider=openrouter --native-chat-model=openai/gpt-5.6-terra`.
The default Gateway connection also accepts a selected PNG. ChatGPT subscription,
Vercel, and custom endpoint profiles offer text input. The selected provider
receives the retained PNG when the conversation uses it.

## Attach a Library image

In a native workbench with image input, choose **+ → Library**, select
one image, and write a message. Grida prepares a PNG for the chat. If an image
cannot be added, your draft and any existing attachment stay in place.

## Choose a reference the agent asks for

In a native workbench on the supported OpenRouter image connection, the agent
can pause a text turn to request a Library image. Open **Choose reference**
to see the suggested search. Refine the search if needed, select one image,
and choose **Use reference**. The model receives the image in the waiting turn.
Your composer draft stays separate.

Choose **Skip** to continue without an image. Closing the picker leaves the
request open. If Grida cannot confirm your answer, reopen it and choose
**Retry answer**. If you paused the turn yourself, use **Resume** after
answering.

## Attach a file for inspection

In a native workspace chat, choose **Attach file** or drop or paste one file
up to 256 KiB into the composer. Send a message with it. The agent can verify
the file’s size and digest and request a short text excerpt. Binary files
provide integrity metadata. The chat keeps a private copy. The provider
receives the display name and any requested excerpt.

Dropping a folder or several files shows a message and keeps the current
attachment and draft. A queued message keeps the same file. To change the
attachment after queuing, remove the queued message and send a new one. Use
**Add PNG** for image understanding and cropping on compatible connections.

## Mention a workspace file

In the native workbench, type `@` and search for a file. Choose the relative
path you want from the suggestions. The mention gives the agent that path.
When the agent reads it, the workspace's current files and permissions apply.
Use **Attach file** to supply a private copy with the message.

## Inspect a local file headlessly

On macOS and Linux, `grida-agent run --input-file FILE` accepts one selected
regular file up to 256 KiB, including without a project. The task can verify
its size and digest and request a short text excerpt. Binary files provide
integrity metadata. The original and private working copy stay with the chat.
Reopening preserves the same file or identifies which copy is unavailable.
[Run with a selected file](https://github.com/gridaco/grida/blob/main/crates/grida-agent/README.md#run-locally)

## View a workspace PNG headlessly

On macOS and Linux, use a source-built host with the Responses `gpt-5.4`
profile and a trusted workspace permission profile. Ask the agent to view
a PNG of up to 256 KiB by its relative path. Include the directory ID if
the file is outside the primary folder. A folder configured to ask still
requires approval for that exact read.

The selected provider receives the pixels for the current turn. Grida keeps
the captured bytes in private chat storage so continuing that turn uses the
same image even if the source changes. Later turns keep a short description.
Ask to view the file again when you need its current pixels.
[Work with selected folders](#work-with-selected-folders)

## Edit selected SVG text

Open an SVG or a slide in a Desktop editor that offers native chat. Select one
plain text element and send an immediate text message in **Act** asking the
agent to read or replace it. Switching tabs or slides, changing the selection,
or editing the document makes the captured target unavailable. Select the text
and send a new message to work on a new target.

The change appears in the SVG editor and can be undone there. Use the editor's
normal **Save** command to write it to disk. The workspace save dialog handles
conflicts when another process has changed a workspace file. In a standalone
window, the chat can use only the captured plain text selection from the
editor. Plan and queued messages omit the selected-text tools.

## Read a finished turn

While a turn runs in the native Desktop workspace pane, its commentary and
actions appear as they happen. When the turn finishes, that work collapses
beneath a header such as **Worked for 1m 12s**, and the final answer stays
visible below it. Select the header to show the recorded commentary and actions
in order. Consecutive actions appear on one line, such as “Read files, ran
commands”; select that line to list each call and its outcome. A stopped or
failed turn shows **Stopped after …** or **Failed after …** instead. A stopped
turn is not collapsed: its partial work stays in view. A turn
that only answered, without tools or commentary, shows just its answer.

Every turn with recorded work keeps its own header, including after you reopen the chat and on
earlier pages. Expanding or reopening a turn only reads the recorded work; it
does not repeat actions or request another model response. Turns recorded
before timing was kept show **Worked** without a duration. A pending question
or approval stays outside the collapsed work so you can answer it.

### Read a finished turn's results

Expand a finished turn to see its recorded tool activity. Images the
latest turn produced appear below its answer, including after reopening the
chat. The ring beside the model picker estimates how much of the model's
context window the visible conversation uses; open it for a breakdown.

Desktop does not show token counts, completion checks or Gateway charges in
the chat. The host still records them with each turn; native clients can read
them through the turn summary. Use the connection's billing record for
charges.

On a compatible image-enabled profile, ask the agent to crop a retained PNG
in Act. Below the finished turn's answer, choose **Preview cropped
PNG** to inspect the image kept in private chat storage. Use **Save PNG as…**
to choose a new file on your computer. If saving fails, choose **Retry save**
to save the same crop. You can reopen the chat and retry while the crop is
still available. Existing destination files are preserved.
The preview also offers **Copy image** and **Download image**.
If the working copy was removed or replaced, the preview reports that the
image is unavailable. Opening a preview leaves the project and the
conversation unchanged.

## Follow a provider retry

The native Desktop workspace pane can show **Retrying after rate limit…**
when Grida Gateway or the Responses API confirms it rejected a request before
starting it and supplies a short retry delay. Grida can make one more attempt
with the same model and connection. Use **Stop** while the retry
is pending.

A downstream failure can leave the result uncertain. Review any partial work
before trying again. To use a different provider, choose another model for
the next turn.

## Use durable client operations

A capable client can opt in to individual version-1 operations through
`clientCapabilities._meta` during initialization. The host advertises the same
keys in `agentCapabilities._meta`. A custom method adds `_` before its capability
key, such as `_co.grida/session/snapshot`.
Each suffix in a grouped row uses the displayed prefix and is negotiated separately.

| Capability key                                    | Operation                                                                            |
| ------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `co.grida/session/submit`                         | Accept a prompt for an idle session under a client-chosen input ID.                  |
| `co.grida/session/snapshot`                       | Read revisions, waiting inputs in order, and the current or latest turn.             |
| `co.grida/session/enqueue`, `input`               | Queue a prompt and read its retained content, settings, and disposition.             |
| `co.grida/session/replace`, `withdraw`, `reorder` | Edit waiting inputs using the current queue revision.                                |
| `co.grida/session/pause`, `resume`, `steer`       | Pause a turn, resume its verified suspension, or send a correction to that turn.     |
| `co.grida/session/stop`, `resume-queue`           | Stop a turn and pause queue advancement, then reopen queue admission when ready.     |
| `co.grida/session/questions`, `answer-question`   | Inspect pending questions and submit a correlated choice, free-text answer, or skip. |
| `co.grida/session/approvals`, `answer-approval`   | Inspect requests for additional access and decide each exact action.                 |
| `co.grida/session/history`, `fork`, `revise`      | Browse retained message anchors, branch a chat, or replace an earlier text message.  |
| `co.grida/session/compact`                        | Summarize earlier model context and keep the original transcript available.          |
| `co.grida/session/skills`                         | List available skills for this chat and select a versioned reference for a prompt.   |
| `co.grida/config/inspect`, `update`, `reload`     | Inspect, change, or reload the host defaults.                                        |

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
later inputs added after that decision. After a full Desktop restart, use the
current queue's **Resume queue** action to explicitly start retained messages.

Negotiate `co.grida/session/turn-summary` to read a settled turn by its
`sessionId` and `turnId`. The response reports the retained answer or a status
fallback, recorded tool dispositions, unresolved operations, and any completion
checks. The same record is available after reopening the chat.

Negotiate both question operations to enable question tools for new inputs.
An answer can resume suspended work when its other conditions allow execution.
An explicit Pause remains effective after the answer. Ordinary ACP prompts keep
their existing text-only profile.

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
directory. Project skills override bundled skills with the same name.

An accepted prompt keeps the skill and project instruction versions it used.
Changes on disk apply to later prompts. If a saved skill selection has changed,
refresh the catalog and select it again. Skills guide the task within its
existing permissions.

Configuration changes apply to later accepted inputs. Existing inputs retain
their captured defaults. An explicit hard context-input cap requires supported
counting for the complete request. A remote counter receives the prepared input.
If counting is unavailable or the input exceeds the cap, the turn records a
failure before generation. [Agent configuration](../reference/agent-configuration.md).

### Use a chat command

In the native Desktop workspace pane, type `/` to see the commands supported
by the connected host. Select one and send it on its own.

- **`/fork`** makes a separate chat from the latest committed message. The
  source stays selected. Choose **Open fork** when you are ready to switch.
  If Desktop cannot confirm the result, retry the same command in that chat.
- **`/compact`** summarizes earlier model context in an idle chat with an open,
  empty queue. Use **Stop** to interrupt it. The original transcript stays
  available. An uncertain result also preserves the previous model context.

### Branch or revise a chat

In the native Desktop workspace pane, hover or focus an earlier user message
and choose **Edit and resubmit**. The editor opens its original text and
shows how many later messages the edit replaces in the active chat. Use an
idle chat with an empty queue and resolve any active Goal first. Only ordinary
retained plain-text inputs in this chat are editable.

Use **Resubmit** to accept the new input in the same chat. If its reply cannot
be confirmed, choose **Retry edit** to check the exact request. The ordinary
composer keeps its unsent draft. A paused queue requires **Resume queue** to
start the replacement. The prior view remains available through ACP history.

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
still waits for its user turn to finish. Automatic compaction uses the size
of earlier text. For supported direct OpenAI Responses models, it can also
use a previous request's reported input count and the verified model window.
A provider's explicit context-limit result can also trigger compaction before
the next eligible message on the same connection and model. The failed turn
remains in the transcript and is not replayed. The provider can still report a
context limit on a later request.

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

In the native Desktop workspace pane, select `/goal` or **+ → Goal** to add a
**Goal** badge, then send the objective. Desktop uses the objective as its
completion criterion and starts automatic continuation within eight work turns
and 64 inference steps. Selecting the command alone starts no work. The
starting message is marked **Sent as goal**, including after reopening the
chat. An accepted goal waits in the retained queue until its first work turn
is reserved. To change it before work starts, remove it from the queue and send
a new goal.

While a goal exists, the strip above the composer shows its status and
objective with clear, pause or resume, and edit controls. Editing changes the
objective text while keeping the same goal and allowance. Editing stops any
current goal turn and preserves its recorded work. A funded review uses the
task controls before its goal can be edited.

Native clients can set separate criteria, allowances, manual continuation,
named reviewers, spending ceilings and check-ins through the goal protocol.
Start a goal in an idle chat with an empty queue. Supply an objective, its
success criteria, and separate allowances for work turns and inference steps.
Opt in to automatic continuation when you start the goal. The next reserved
turn follows any prompts already in the queue. The agent waits if it needs
input, runs out of allowance, or records no further progress.
Without that opt-in, the goal reserves its first work turn only. An explicit
Resume can authorize one more work turn within the remaining allowance; it does
not turn on automatic continuation. Earlier queued messages go first.
For a manual goal started elsewhere, the Desktop goal strip's resume control
continues one more turn.

Inspect the goal to see progress, allowance used and held, and any blocker.
Pause and Resume preserve the allowance for the same suspended turn. Revising
the objective or clearing the goal stops its current work. The prior
turn's evidence and uncertainty remain available.

When a goal is **Ready for your review**, inspect the proposed result and
the success criteria. Choose **Confirm goal complete** if the work meets
them. The goal records that you confirmed completion and keeps its used
allowance. You can confirm after the work settles even if no allowance
remains. The agent's proposal stays tied to the work it came from, including
after reopening the chat.

A trusted headless launch can independently verify configured file criteria
from the complete bytes recorded by `read_file`. The goal retains the exact
verification from that turn. [Configure observed-file criteria](https://github.com/gridaco/grida/blob/main/crates/grida-agent/README.md#verify-a-goals-observed-file-bytes)

A supported native Desktop Gateway, saved OpenRouter, or saved Vercel connection,
or a private ACP client, can select
**Ultra** for a goal. One independent review shares its inference allowance.
Later automatic work proceeds directly if only one or two steps remain. Use
the task's Pause, Resume, or Stop while the funded turn is active. If the
review finishes later, choose **Refresh** on the Desktop goal strip to account
for its settled steps. ACP clients can use the negotiated reconciliation
control. Resume the goal explicitly to continue after reconciliation.

In Desktop, **Stop** ends the current turn and retains the goal's state.
Clear an active or blocked goal before replacing an earlier message in the
same chat. A fork starts independently.

After a host restart, inspect the goal and its latest turn. An ACP client can
use Recover to reconsider eligible work under the original allowance and
authorization.
Work with an interrupted dispatch remains recorded against its existing turn.

Private ACP clients can allow one check-in when starting a
**Standard Act** goal. The check-in waits within the first reserved turn and
uses its remaining inference allowance. After reopening, restore the schedule
and resume the goal if it is paused. Cancelled check-ins require explicit
continuation. Later automatic Goal turns receive their own permissions.
[Schedule a follow-up](./scheduled-work.md)

Negotiate the version-1 capabilities `co.grida/goal/start`, `co.grida/goal/inspect`,
`co.grida/goal/control`, and `co.grida/goal/recover` for these operations.
`co.grida/goal/manual-continuation` additionally identifies support for one-turn
manual continuation and reports when that continuation is queued.
The [client protocol reference](https://github.com/gridaco/grida/blob/main/packages/grida-ai-agent/docs/rust-client-protocol.md#persistent-goal-operations)
lists their parameters.

### Ask the agent to check later

Private ACP clients can opt in on a single Act submission and inspect the
retained time, reason, status, and whether the host has armed the timer. They
can cancel the wait, explicitly continue the task, or restore its schedule
after restart. For the Desktop workflow, see [Schedule a follow-up](./scheduled-work.md).

The [feature catalog](./features.md) describes the wider agent experience and
the availability of its product features.
