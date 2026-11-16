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

| Surface                                             | `config.toml`                                                                                              | Changes by the agent                                                  | Managed operations          |
| --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- | --------------------------- |
| Grida Desktop on macOS and Linux                    | One per workspace, in a digest-named folder under `chats/workspaces/` in Desktop's application data folder | File edits; every write asks for your approval                        | Not offered                 |
| Source-built `grida-agent run`                      | In the `--state-dir` you choose; read at startup                                                           | File edits under a write-capable permission profile; every write asks | Not offered                 |
| Source-built `grida-agent serve` with an ACP client | In the `--state-dir` you choose                                                                            | As for `run`                                                          | Available after negotiation |

In Desktop, ask the agent to change a setting, or edit the file while Desktop is
closed. Desktop has no settings control. [Change agent settings](../agent/settings.md)

For an ACP client, start the host with your own state directory, for example
`grida-agent serve --stdio --state-dir /absolute/path/to/agent-state` plus
your provider options, edit `/absolute/path/to/agent-state/config.toml`, and
call `_co.grida/config/reload`.

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

The native host can count requests on Responses connections and
on a supported local llama.cpp text connection explicitly launched with
`--llama-cpp-input-count`. The llama.cpp option requires a direct numeric
loopback `/v1` endpoint. It does not discover or change the model's capacity.

The limit remains subject to actual model capacity and host constraints. A larger
value does not enlarge the model's context window. Remove `max_input_tokens` to
restore automatic budgeting. Zero is invalid.

An absent file selects the host's defaults. An existing file requires its schema
version. Unknown fields, unsupported versions, and invalid values are rejected.

## Configure local request counting

In Grida Desktop on macOS and Linux, quit Desktop and set
`"input_counting": "llama.cpp"` on the saved endpoint in Desktop's endpoint
file, `~/.grida/agent/endpoints.json`.
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

Set the workspace's input limit in its `config.toml` as above. Start Desktop,
approve the saved endpoint address, and choose its **llama.cpp counting**
connection for a new chat. Use a numeric loopback
address and the `/v1` base path on a server that supports
`POST /v1/chat/completions/input_tokens`. Desktop uses that route only when
the counted chat has an input limit. It sends the same prepared text and
tools that the generation request would use. A failed count or a request
over the limit ends before generation.
[llama.cpp token counting API](https://github.com/ggml-org/llama.cpp/blob/master/tools/server/README.md#post-v1chatcompletionsinput_tokens-token-counting)

The ordinary endpoint choice keeps working as before. Removing the
declaration makes chats saved on the counting connection unavailable until it
is restored. For a headless host, launch with `--llama-cpp-input-count`
instead.

## Scope and activation

Changes apply to later accepted inputs. Running and already accepted work retains
its captured settings.

An edit by the agent takes effect for inputs accepted after it is saved. A
manual edit takes effect at host startup or after an explicit configuration
reload. An invalid startup file prevents execution and reports its
diagnostic. A rejected reload retains the last valid active defaults and
reports the file diagnostic.

Inspection distinguishes the current file revision from the active settings
snapshot. They can differ after a manual edit awaiting reload or a rejected
reload.

## Changes made by the agent

The agent reads and edits `config.toml` with its ordinary file tools, as the
directory `agent-settings`; that directory holds only this file. A read runs
without asking and reports whether the content is active, waiting for the next
start, or invalid. Every `write_file` or `edit_file` on it is an approval request
for that exact change, answered like any other file approval. It is asked even
where the agent may write the project without asking, an earlier approval does
not cover the next change, Plan offers no writes, and automatic review never
answers it. Commands the agent runs can neither read nor write the file.

The host validates the complete result before saving it. Invalid content is
refused with its diagnostic and leaves the file and the active settings
unchanged. A saved change applies to inputs accepted afterwards.

## Managed changes

Capable ACP clients use typed host operations for inspection, set/reset, and
reload. These are client operations for a person's own tooling; they require the
corresponding negotiated ACP capability and are not offered to the agent.
[Connect an agent client](../agent/clients.md#use-durable-client-operations).

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
