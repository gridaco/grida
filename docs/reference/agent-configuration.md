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

| Surface                                             | `config.toml`                                                                                              | How to change it                                                                      |
| --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Grida Desktop on macOS and Linux                    | One per workspace, in a digest-named folder under `chats/workspaces/` in Desktop's application data folder | Edit the file while Desktop is closed.                                                |
| Source-built `grida-agent run`                      | In the `--state-dir` you choose                                                                            | Edit the file before starting the host.                                               |
| Source-built `grida-agent serve` with an ACP client | In the `--state-dir` you choose                                                                            | Edit and reload the file, or use a managed configuration operation after negotiation. |

[Change agent settings](../agent/settings.md)

For an ACP client, start the host with your own state directory, for example
`grida-agent serve --stdio --state-dir /absolute/path/to/agent-state` plus
your provider options, edit `/absolute/path/to/agent-state/config.toml`, and
call `_co.grida/config/reload`.

## Supported file

```toml
schema_version = 1

model_context_window = 64000
model_auto_compact_token_limit = 48000
```

| Field                            | Meaning                                        | Accepted values                                      |
| -------------------------------- | ---------------------------------------------- | ---------------------------------------------------- |
| `schema_version`                 | Configuration-file format                      | `1`                                                  |
| `model_context_window`           | Context capacity used for usage and compaction | Optional integer from `1` through `9007199254740991` |
| `model_auto_compact_token_limit` | Token usage that triggers automatic compaction | Optional integer from `1` through `9007199254740991` |

The effective window is the smaller of the known model window and the
configured value when both exist. A configured window supplies the capacity
when model metadata is unavailable. With a window, the automatic threshold
defaults to 90% rounded down, with a minimum of one token. An explicit
threshold can lower that value. With an unknown window, an explicit
threshold can still trigger compaction.

The host uses reported foreground context use where available and estimates
the rest. It may summarize older chat material before a turn and earlier
tool exchanges during a turn. The current user messages and the visible
transcript stay available. These settings govern when compaction is attempted.
The provider enforces the request's actual capacity.

An absent file selects the host's defaults. An existing file requires its schema
version. Unknown fields, unsupported versions, and invalid values are rejected.

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

## Earlier accepted work

The old `[context]` table with `max_input_tokens` is accepted for file
compatibility. New inputs use the top-level context settings described above.
Inputs accepted under the old policy retain their captured hard limit.
Restore the original **llama.cpp counting** connection if retained work used it.

The host protects its settings file on new turns. A queued or paused turn
that already captured access to `agent-settings/config.toml` keeps the
earlier grant and exact-action approval requirements through recovery.
A setting change still takes effect for later accepted inputs.

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
