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

Choose a text model and an OpenAI-compatible base URL that supports streamed
chat completions. HTTPS endpoints and numeric-loopback HTTP endpoints are
accepted. Put a required bearer credential in an environment variable before
starting the host. `--credential-env` names that variable.

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
| 130       | Stopped task or process signal                         |

After an output failure, use the accepted identifiers to inspect retained state.
An uncertain outcome requires reconciliation before repeating effects.

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

## Use durable client operations

A capable client can opt in to individual version-1 operations through
`clientCapabilities._meta` during initialization. The host advertises the same
keys in `agentCapabilities._meta`. A custom method adds `_` before its capability
key, such as `_co.grida/session/snapshot`.

| Capability key                                    | Operation                                                                        |
| ------------------------------------------------- | -------------------------------------------------------------------------------- |
| `co.grida/session/submit`                         | Accept a prompt for an idle session under a client-chosen input ID.              |
| `co.grida/session/snapshot`                       | Read revisions, waiting inputs in order, and the current or latest turn.         |
| `co.grida/session/enqueue`, `input`               | Queue a prompt and read its retained content, settings, and disposition.         |
| `co.grida/session/replace`, `withdraw`, `reorder` | Edit waiting inputs using the current queue revision.                            |
| `co.grida/session/pause`, `resume`, `steer`       | Pause a turn, resume its verified suspension, or send a correction to that turn. |
| `co.grida/session/stop`, `resume-queue`           | Stop a turn and pause queue advancement, then reopen queue admission when ready. |
| `co.grida/config/inspect`, `update`, `reload`     | Inspect, change, or reload the host defaults.                                    |

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

Configuration changes apply to later accepted inputs. Existing inputs retain
their captured defaults. An explicit hard context-input cap requires supported
counting for the complete request. If counting is unavailable, the turn reports
that failure before sending a model request.

The [feature catalog](./features.md) describes the wider agent experience and
the availability of its product features.
