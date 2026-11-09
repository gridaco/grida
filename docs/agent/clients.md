---
title: Connect an agent client
description: Run Grida Agent headlessly or connect an Agent Client Protocol client to its native host.
keywords: [agent, headless, ACP, automation, native host]
doc_tasks: [enhance]
format: md
---

# Connect an agent client

The native Grida Agent host runs tasks from scripts and serves Agent Client
Protocol (ACP) clients. Both entrypoints use the same conversation master and
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

The [feature catalog](./features.md) describes the wider agent experience and
the availability of its product features.
