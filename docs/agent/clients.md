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

### Plan before carrying out a task

In the native Desktop workspace pane, choose **Plan** or **Act** using
**Mode for next message**. The choice applies to the next message, including
one you queue while the agent is working. **Send to current turn** keeps
that turn's accepted mode. To carry out a proposal, choose **Act** and send
a new message in the same chat.

Use `--mode plan` with `run` or `serve` to investigate and prepare a proposal.
The agent can read permitted material and ask enabled questions. Commands,
working-copy edits, settings changes through agent tools, and timed wake-ups
are unavailable in Plan.

To authorize execution, open the same chat with `--mode act` and submit a new
prompt. Act is the default and still uses your selected permissions. Previously
accepted Plan inputs keep their limits through queue edits and restart. A host
launched in Plan can inspect or stop retained Act work. Continuing that work
requires an Act launch.

### Require a completion check

Use `--require-completion-text` on `run` or `serve` to require final answer
text on newly accepted tasks. A blank answer fails the task and the completion
account records the check's decision. Keep the same launch setting when
resuming those tasks. You can still Stop a retained task when the check is
unavailable. The check uses the recorded answer and preserves any work the
agent already completed.

A trusted native permission profile can also set one command to check an Act
turn before it completes. Use a reviewed executable with a read-only workspace
scope. A required check blocks completion when it rejects or fails. An
observational check records its result and leaves the completion decision in
place. Plan does not run the command. Resuming uses the selected definition,
and an interrupted command with an uncertain result is never repeated
automatically. [Native launch profile](https://github.com/gridaco/grida/blob/main/crates/grida-agent/README.md)

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
named subagents, or retained input storage. Authored files and independent
forks stay available. Retry a lost deletion reply with the original request
ID, workspace, and revisions.

When a native chat owner is active in Desktop, the workspace **Chat** selector
shows saved chats in that workspace. Use **Older chats** to browse further or
**Archived chats** to find an archived chat. Selecting a chat opens its transcript.
With a chat open, choose **Rename chat** and **Save title**. Clear the title to
use the default name. Choose **Archive chat** to move it out of the active list
while keeping its draft and any running work. Open it from **Archived chats**
and choose **Restore chat** to return it to the active list.

On macOS and Linux, select an eligible idle chat and choose **Delete chat**.
Confirm in the Desktop dialog to remove the saved conversation. Desktop
closes the deleted chat in any open workspace window. Project files and
independent forks stay available. Chats with outstanding work or retained
dependencies remain available to archive.

With the native **Ask me** profile, a read outside the current grants pauses
for review when its folder is eligible for additional access. The pane shows
the requested action and target. **Allow once** authorizes that action.
**Decline** leaves the additional access denied.

Answer a question in its card by selecting a choice, writing a reply, or
skipping. The agent may continue other work while it waits. A separate message
sent from the composer joins the queue and leaves the question open.

While a turn is active, the native workspace composer queues text as a
follow-up. You can edit, move, or remove waiting messages. Choose **Send to
current turn** when the text should guide that turn at its next decision.
**Stop** holds the queue. Choose **Resume queue** to let waiting messages run.

Text and resource-link descriptors are accepted as prompt content. A resource
link supplies context about a resource. File access follows a separately granted
capability.

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

Each WebSocket text message carries one ACP JSON-RPC object. Closing a client
connection detaches its observers while the host continues its accepted work.
Stopping the service requests suspension of the work it owns.

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

Retained work keeps its original tool connection. If that connection closes,
Stop is still available for a suspended turn. A lost reply after a tool call
leaves an uncertain result. Reconcile it before sending new work that would
repeat the effect.

## Assign work to a named subagent

Start the source-built host with a direct provider and private stdio.

```sh
target/debug/grida-agent serve --stdio --subagents \
  --state-dir "$GRIDA_AGENT_STATE" \
  --endpoint "$GRIDA_AGENT_ENDPOINT" --model "$GRIDA_AGENT_MODEL" \
  --credential-env OPENAI_API_KEY
```

During initialization, negotiate version 1 for `co.grida/subagent/create`,
`assign`, `inspect`, `pause`, `resume`, `steer`, `stop`, `resume-queue`,
and `withdraw` separately. Attach to the parent and finish an Act turn.

1. Create the child with a display name, a creation request ID, and an
   allowance of one to eight work turns. Retain the returned child ID.
2. Assign text using the child ID, the settled parent turn ID, and a new
   input ID. The child uses its own conversation history and receives no
   workspace tools. Assign follow-ups with the same child ID and new input
   IDs. They wait in order within the child's remaining allowance.
3. Inspect a particular input to read the result from its original child
   turn. Use Pause to suspend that turn, Steer to add a correction, and
   Resume to continue it. After restart, attach to the same parent and use
   the retained child and input IDs. Stop ends the assignment and holds its
   queue. Use Resume Queue to start the next assignment, or withdraw a queued
   assignment to free its place.

Retry creation or assignment with the same ID and fields to recover its
receipt. New assignments allow up to two generation steps. A continuation
uses the same assignment and its remaining steps. Reserved work still counts
after interruption. Resuming, steering, and assigning new work require the
same verified provider authority.
See the [native host request fields](https://github.com/gridaco/grida/blob/main/crates/grida-agent/README.md).

## Ask in a temporary side chat

Choose **Side chat** in an attached native Desktop chat. Ask in its separate
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

To ask the agent to change the default with a compatible provider, select
**Act** and **Review settings permission on next Act send**. Write a short
message and confirm it when Desktop asks. That permission covers the context
input limit for this message. To change a queued message with this permission,
withdraw it and review a new send.

## Attach a PNG to a message

When the native Desktop chat advertises image input, choose **Add PNG**,
select one PNG up to 256 KiB, and write a message before sending. The text
and image enter the chat together, including when the message joins the
queue. A failed send preserves the draft for retry. To change a queued
image, remove the queued message and submit a new one.

This picker was verified with a disposable Responses API GPT-5.4 profile.
The current native Desktop Gateway and ChatGPT subscription profiles
offer text input.

## Read a turn summary

In the native Desktop workspace pane, open **Turn summary** below the latest
finished turn when it has additional details. It can show recorded tool
outcomes, completion checks, and unresolved work. A simple reply serves as
its own summary. Reopening the chat restores the latest recorded summary.

On a compatible image-enabled profile, ask the agent to crop a retained PNG
in Act. Open **Turn summary** for the finished turn and choose **Preview cropped
PNG** to inspect the saved image. Use **Copy image** or **Download image** to
keep a separate copy. The saved crop lives in private chat storage.

If the working copy was removed or replaced, the summary still shows the
recorded result and the preview reports that the image is unavailable.
Opening a preview leaves the project and the conversation unchanged.

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
loads its retained state.

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

### Branch or revise a chat

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

After a successful compaction, future model requests use the summary and
subsequent conversation. The original transcript remains available. If
compaction fails or its result is uncertain, the host keeps the previous
context. Pause and Stop apply while the summary runs. An identified request
can inspect the retained attempt after reconnecting.

### Work toward a persistent goal

In the native Desktop workspace pane, **Add goal** opens the goal form.
**Start goal** accepts the work and the allowance you entered. Automatic
continuation is off until you select it. An accepted goal waits in the
retained queue until its first work turn is reserved. It appears as a goal
after restart. To change it before work starts, remove it from the queue and
start a new goal with the revised objective or allowance.

Start a goal in an idle chat with an empty queue. Supply an objective, its
success criteria, and separate allowances for work turns and inference steps.
Opt in to automatic continuation when you start the goal. The next reserved
turn follows any prompts already in the queue. The agent waits if it needs
input, runs out of allowance, or records no further progress.
Without that opt-in, the goal reserves its first work turn only.

Inspect the goal to see progress, allowance used and held, and any blocker.
Pause and Resume preserve the allowance for the same suspended turn. Revising
the objective or clearing the goal stops its current work. The prior
turn's evidence and uncertainty remain available. A model report alone
does not establish completion.
In Desktop, **Stop** ends the current turn and retains the goal's state.
Clear an active or blocked goal before replacing an earlier message in the
same chat. A fork starts independently.

After a host restart, inspect the goal and its latest turn. An ACP client can
use Recover to reconsider eligible work under the original allowance and
authorization.
Work with an interrupted dispatch remains recorded against its existing turn.

Negotiate the version-1 capabilities `co.grida/goal/start`, `co.grida/goal/inspect`,
`co.grida/goal/control`, and `co.grida/goal/recover` for these operations.
The [client protocol reference](https://github.com/gridaco/grida/blob/main/packages/grida-ai-agent/docs/rust-client-protocol.md#persistent-goal-operations)
lists their parameters.

### Ask the agent to check later

A private ACP client can enable one timed wake-up when submitting a task.
Ask the agent what to check and how long to wait. The task suspends without
an open model request. While the host is running, it continues the same task
when due and when task admission allows it. Inspect the wake-up to see its
time, reason, and whether the current host has armed it.

Pause holds delivery. Stop ends the task. Cancelling just the wake-up leaves
the suspended task available for an explicit Resume. After a host restart,
inspect the wake-up and explicitly recover it to resume timer delivery.

The [feature catalog](./features.md) describes the wider agent experience and
the availability of its product features.
