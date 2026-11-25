# Agent host configuration

The native host loads one user-wide `config.toml` from `$GRIDA_HOME`, which
defaults to `~/.grida`. Standalone and supervised hosts use that location.
`--state-dir` selects runtime state. Trusted ACP clients can inspect and reload
the active defaults. Session model and mode selectors have their own contracts.

Field definitions belong to `grida-agent-master`. The native host owns parsing,
persistence, activation, and protocol exposure. The execution layer receives
resolved settings and configuration identity. The host resolves the selected
model's context capacity before accepting a new input.

## Field review

| Field                            | Meaning                                                   | Default and bounds                                                                                                                                                              |
| -------------------------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `schema_version`                 | Version of this file's schema.                            | Required version `1` when the file exists.                                                                                                                                      |
| `model_context_window`           | Context capacity used for usage and automatic compaction. | Optional positive safe integer. Defaults to 272,000 tokens, bounded by model capacity. An explicit value can use up to the known capacity, or 272,000 when capacity is unknown. |
| `model_auto_compact_token_limit` | Usage that triggers automatic compaction.                 | Optional positive safe integer. Defaults to 90% of the working window, rounded down to at least one token. An explicit value can lower the threshold.                           |

Each optional field accepts integers from `1` through `9007199254740991`.
The native host captures the resolved values with accepted input. Reported
foreground usage and estimates guide compaction before turns and during
tool exchanges. Current user messages remain in context. Providers enforce
their actual capacities independently.

```toml
schema_version = 1

model_context_window = 64000
model_auto_compact_token_limit = 48000
```

Remove either key to restore its default. A missing file uses defaults. The
host reports unknown keys with the source path and applies recognized settings.
Malformed TOML, unsupported schema versions, and invalid recognized values
produce configuration diagnostics.

## Hook definitions

The [hook behavior contract](https://grida.co/docs/wg/ai/agent/hooks) defines
execution boundaries. Trusted native profiles select up to eight ordered
`session_start`, `before_input`, `before_tool`, `after_tool`, or
`before_completion` checks. Each binds a canonical system executable and digest,
literal arguments, source, required/observe behavior, timeout and captured
read-only command scope. Executable and ancestor ownership and ACL checks remain
mandatory. User-owned programs require a separate custody contract.

Desktop reads ordered `[[hooks]]` definitions and Settings → Personalization
from the same user-owned file. Hook registration validates the hook section.
The native host validates the context settings. The top-level `web_search` key accepts
`"automatic"` or `"disabled"`. Automatic offers search in eligible chats and
is the default when the key is omitted. Disabled blocks hosted search.
Eligible ChatGPT Subscription requests use live access when search is
permitted. Desktop reads legacy `"live"` as automatic and legacy
`"on_demand"`, `"cached"`, and `"indexed"` as disabled.

Desktop ignores the retired `[features].fast_mode` key. Response speed comes
from the chat’s saved selection and the model connection’s current offer.
The boolean `[desktop].composer-predictions-enabled` defaults to false.
Edits from Settings preserve unrelated fields, comments and hook trust.
[Desktop settings](../../../docs/agent/desktop-settings.md).

Workspace
`hooks.json` registries are ignored, preserved on disk, and never promoted to
global authority. Settings > Hooks inspects the source and reviews new or changed
definitions through native confirmation. Private receipts retain approved
definition revisions, not a second definition source. Canonical existing Grida
home directories may be 0755 when owned by the user and not writable by others;
the config has the same integrity requirement, while trust receipts remain 0600.

Fresh connections load the current configured and trusted definitions. Enabled
untrusted or invalid definitions block new execution with a recoverable Hooks
diagnostic. Existing workers retain their selected policy; restarting Desktop
refreshes all connections. Accepted work retains its captured policy. A changed
capture cannot resume paused work. Stop and inspection
remain available without rerunning checks. Checks can run in Plan or Act when
the task already has the required read scope. A text-only child gains no scope
merely to execute a check. Project and plugin discovery is deferred to a source
adapter with review of new or changed executable content.

Hook definitions use `timeout_ms`, an executable path, and literal
`arguments`. Headless supervisors supply their own trusted launch profiles.
The native host executes from a reviewed launch profile. Executable trust,
provider credentials, and execution authority have separate custody.

## Activation and persistence

The native host reads the file at startup. An invalid startup file reports a
configuration error. An explicit reload validates and activates the edited
file for future inputs. A rejected reload retains the running host's last
valid snapshot. Accepted work retains its settings and source identity through
queueing and recovery.

Configuration is protected from confined agent commands. Grida-managed
file creation and personalization edits use the native configuration writer.
It serializes changes, validates the candidate, checks the file revision, and
publishes atomically while preserving unrelated content and comments.
External editors operate independently of the writer lock. Edit before
starting the host or explicitly reload afterward.

## Shared host operations

Each operation requires its negotiated capability.

| Method                     | Parameters          | Result                                                                  |
| -------------------------- | ------------------- | ----------------------------------------------------------------------- |
| `_co.grida/config/inspect` | None (`{}`).        | Field definitions, file revision, diagnostics, and the active snapshot. |
| `_co.grida/config/reload`  | `expectedRevision`. | Validates and activates the file for future requests.                   |

`expectedRevision` is the fingerprint from inspection, written as 64
lowercase hexadecimal characters. Use null when the file is absent.
Reload fails with `config_revision_changed` when the file revision differs.
Inspection reports an unreadable source with a diagnostic and a null file
revision. The active settings snapshot remains available.
