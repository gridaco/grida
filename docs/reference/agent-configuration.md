---
title: Agent configuration
description: Supported native agent settings, their scope, and configuration-file behavior.
keywords: [agent, configuration, context, native host]
format: md
---

# Agent configuration

The native host reads `config.toml` from its selected state directory. The file
holds user defaults for that host. Each accepted input retains the defaults
that applied when it was accepted.

## Supported file

```toml
schema_version = 1

[context]
max_input_tokens = 64000
```

| Field                      | Meaning                                   | Accepted values                                                                    |
| -------------------------- | ----------------------------------------- | ---------------------------------------------------------------------------------- |
| `schema_version`           | Configuration-file format                 | `1`                                                                                |
| `context.max_input_tokens` | Hard upper limit for complete model input | An integer from `1` through `9007199254740991`, or omitted for automatic budgeting |

The input limit covers instructions, conversation history, media representation,
tool declarations, and provider framing. The provider must establish an exact
count or conservative bound for its complete prepared request. Unsupported
counting or an excessive request produces a recorded failure before generation.
Remote counting sends the prepared input to the selected provider under the
same authority and deadline as generation. An estimate cannot certify this
hard limit.

Source-built native clients can count requests on Responses connections and
on a supported local llama.cpp text connection explicitly launched with
`--llama-cpp-input-count`. The llama.cpp option requires a direct numeric
loopback `/v1` endpoint. It does not discover or change the model's capacity.

The limit remains subject to actual model capacity and host constraints. A larger
value does not enlarge the model's context window. Remove `max_input_tokens` to
restore automatic budgeting. Zero is invalid.

An absent file selects the host's defaults. An existing file requires its schema
version. Unknown fields, unsupported versions, and invalid values are rejected.

## Configure local request counting

In a managed native macOS Desktop profile, quit Desktop and set
`"input_counting": "llama.cpp"` on the saved endpoint in
`~/Library/Application Support/Grida Native/agent/retained-settings/endpoints.json`.
This private file holds an array of endpoint entries. An entry can look like
this.

```json
{
  "id": "llama",
  "base_url": "http://127.0.0.1:8080/v1",
  "models": [{ "id": "local-model" }],
  "input_counting": "llama.cpp"
}
```

Start Desktop, approve the saved endpoint origin, and choose its
**llama.cpp counting** connection for a new chat. Use a numeric loopback
address and the `/v1` base path on a server that supports
`POST /v1/chat/completions/input_tokens`. Desktop uses that route only when
the counted chat has an input limit. It sends the same prepared text and
tools that the generation request would use. A failed count or a request
over the limit ends before generation.
[llama.cpp token counting API](https://github.com/ggml-org/llama.cpp/blob/master/tools/server/README.md#post-v1chatcompletionsinput_tokens-token-counting)

The ordinary endpoint choice keeps its original binding. Removing the
declaration makes saved counted chats unavailable until it is restored.

## Scope and activation

Changes apply to later accepted inputs. Running and already accepted work retains
its captured settings.

Manual edits take effect at host startup or after an explicit configuration
reload. An invalid startup file prevents execution. A rejected reload retains
the last valid active defaults and reports the file diagnostic.

Inspection distinguishes the current file revision from the active settings
snapshot. They can differ after a manual edit awaiting reload or a rejected
reload.

## Managed changes

Capable clients use the same typed host operations for inspection, set/reset,
and reload. These operations require the corresponding negotiated ACP
capability. [Connect an agent client](../agent/clients.md#use-durable-client-operations).

| Method                     | Behavior                                                                       |
| -------------------------- | ------------------------------------------------------------------------------ |
| `_co.grida/config/inspect` | Returns the field description, file revision, diagnostics, and active snapshot |
| `_co.grida/config/update`  | Applies one typed set or reset change using the expected file revision         |
| `_co.grida/config/reload`  | Validates and activates the file at the expected revision                      |

Managed updates serialize writes, validate the complete result, preserve
unrelated comments, and atomically replace the file. A stale revision is rejected
so a client can inspect the newer state before trying again. If a reply is lost,
inspection reveals the current revision and values.

When editing manually, stop the host or reload deliberately after the edit.
External editors operate independently of the managed writer lock.

## Changes requested through the agent

A capable native client can expose `config_inspect` to the agent. Its result
includes the supported field description, current file and active defaults,
and the defaults captured for the current task.

`config_update` and `config_reload` require an explicit permission on the accepted
input. A client supplies `allowConfigurationChanges: true` when submitting,
enqueueing or replacing that input, after enabling all three configuration
capabilities. This permits changes to the reviewed default for future tasks.
Existing tasks retain their captured settings.

Successful changes report the snapshot produced by the write. After an
interrupted response, recovery can report that the requested setting is present.
A differing state remains uncertain and needs inspection before another change.
