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
| 6         | Input required with a retained question                |
| 130       | Stopped task or process signal                         |

After an output failure, use the accepted identifiers to inspect retained state.
An uncertain outcome requires reconciliation before repeating effects.

Use `run --questions` to enable structured questions in an embedded run. When
an answer is needed, the process verifies suspension and returns `input_required`
with the session, turn, and pending question identities. A capable service client
can answer the retained question through the same state directory.

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

Use `session/list` to discover saved chats for an absolute workspace `cwd`.
Follow `nextCursor` with the same workspace to get the next page. The list
shows chat identities in newest-created order. Choose a chat and call
`session/load` to open its transcript. [ACP session listing](https://agentclientprotocol.com/protocol/v1/session-list)

When a native chat owner is active in Desktop, the workspace Chat selector
combines recent chats with saved chats from that workspace. Use **Older chats**
to browse further. Selecting a chat opens its transcript.

With the native **Ask me** profile, a read outside the current grants pauses
for review when its folder is eligible for additional access. The pane shows
the requested action and target. **Allow once** authorizes that action.
**Decline** leaves the additional access denied.

Answer a question in its card by selecting a choice, writing a reply, or
skipping. The agent may continue other work while it waits. A separate message
sent from the composer joins the queue and leaves the question open.

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
Clear an active or blocked goal before replacing an earlier message in the
same chat. A fork starts independently.

After a host restart, inspect the goal and its latest turn. Use Recover to
reconsider eligible work under the original allowance and authorization.
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
