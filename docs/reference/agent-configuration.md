---
title: Agent configuration
description: Supported native agent settings, their scope, and configuration-file behavior.
keywords: [agent, configuration, context, native host]
format: md
---

# Agent configuration

The native host reads user-wide settings from `~/.grida/config.toml`.
Set an absolute `GRIDA_HOME` to select `$GRIDA_HOME/config.toml`. CLI,
supervised native sessions, and ordinary Desktop development launches
use the same location. The `--state-dir` option selects runtime state.
[Change agent settings](../agent/settings.md)

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

An absent file selects the built-in defaults. An existing file requires
`schema_version = 1`. Unknown keys produce a warning naming the file and key.
Malformed TOML, unsupported schema versions, and invalid values for recognized
settings report a configuration error with the file and, where available, the
key. The global file also holds Desktop personalization and hook definitions.
[Desktop settings](../agent/desktop-settings.md) · [Configure hooks](../agent/hooks.md)

## Activation

Edit the file before launching Grida or explicitly reload it through ACP.
Changes apply to later accepted inputs. Running and queued work retain
their captured settings through recovery. A rejected reload retains the
last valid active settings and reports the file diagnostic.

Grida-managed edits preserve unrelated fields and comments and check for
conflicting changes. External editors do not participate in the managed
writer lock.

## Client operations

Trusted ACP clients can inspect and reload configuration through separately
negotiated capabilities. [Connect an agent client](../agent/clients.md#use-durable-client-operations)

| Method                     | Behavior                                                                        |
| -------------------------- | ------------------------------------------------------------------------------- |
| `_co.grida/config/inspect` | Returns field definitions, file revision, diagnostics, and the active snapshot. |
| `_co.grida/config/reload`  | Validates and activates the file at the supplied expected revision.             |

Read the expected revision from inspection. It is a 64-character lowercase
hexadecimal fingerprint. Use null when the file is absent. A revision change
between inspection and reload returns `config_revision_changed`. Inspection
reports an unreadable source with a diagnostic and a null file revision. The
active settings snapshot remains available after a rejected reload.
