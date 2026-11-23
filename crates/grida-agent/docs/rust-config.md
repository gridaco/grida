# Agent host configuration

The native host reads agent defaults from TOML. A trusted client can
inspect, change or reset them through typed operations. Session model and
mode selectors have their own settings contracts.

## Scope

The host owns one file at `<state-dir>/config.toml`, with an explicit schema
version. Its persistent scope is this user's agent defaults on this host.
Explicit per-request overrides belong to accepted input. Project-file
inheritance, named profiles, environment expansion, and a universal settings
framework are outside this schema.

Field definitions belong to `grida-agent-master`. The native host owns parsing,
storage, update serialization, and protocol exposure. Core components receive
resolved limits and configuration identity through their existing contracts.
No configuration crate or TOML dependency is required in the neutral core.

The host's configuration module uses the master's field definitions for
validation and inspection. The host resolves the selected model's context
capacity before capturing a new input.

## Field review

| Field                            | Meaning                                                   | Default and bounds                                                                                                                                                                                            |
| -------------------------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `schema_version`                 | Version of this file's schema.                            | Required version `1` when the file exists.                                                                                                                                                                    |
| `model_context_window`           | Context capacity used for usage and automatic compaction. | Optional positive safe integer. Omission uses the known model window. An explicit value supplies an unknown window or lowers a known one.                                                                     |
| `model_auto_compact_token_limit` | Usage that triggers automatic compaction.                 | Optional positive safe integer. With a resolved window, the default and maximum are 90% of the window, rounded down with a minimum of one token. With an unknown window, an explicit threshold still applies. |

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

Remove either key to restore its default. Older source files may still
contain `[context].max_input_tokens`. Captured inputs from that policy keep
their old limit. New inputs use the top-level keys.

## Hook definitions

The [hook behavior contract](https://grida.co/docs/wg/ai/agent/hooks) defines
execution boundaries. Trusted native profiles select up to eight ordered
`session_start`, `before_input`, `before_tool`, `after_tool`, or
`before_completion` checks. Each binds a canonical system executable and digest,
literal arguments, source, required/observe behavior, timeout and captured
read-only command scope. Executable and ancestor ownership and ACL checks remain
mandatory. User-owned programs require a separate custody contract.

Desktop reads ordered `[[hooks]]` definitions only from the user-owned global
`$GRIDA_HOME/config.toml` (default `~/.grida/config.toml`). This global source is
separate from the per-host context-defaults file described above. The current
global schema requires `schema_version = 1`. Settings → Personalization and
hand edits use the same global file. The top-level `web_search` key accepts
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

The per-host configuration service owns context settings. Desktop's separate
global source owns executable hooks and uses
`timeout_ms` and an executable path plus literal `arguments`; it has no project
discovery, regex matchers, async hooks, or plugin source. Headless supervisors
retain their explicit low-level launch profiles; the host does not auto-load
Desktop's global file. Executable trust remains a distinct user or host decision.
Provider credentials and execution authority retain their separate custody.

## Effective configuration

Resolution starts with versioned product defaults, applies this host's validated
user overrides, then applies explicit request overrides. Host requirements and
provider constraints bound the result independently of that precedence.

Accepted work captures the resolved configuration and its source identities.
Changing a persistent default applies to later accepted requests. Already queued
work retains its captured settings. Changing active or queued work uses its
explicit control or replacement operation, with renewed validation.

The configuration writer updates user defaults only. It never turns a
request limited to one task into a persistent global change. When the requested
scope is ambiguous, the master resolves that ambiguity before writing. Additional
persistent scopes require their own field and precedence review.

## Shared host operations

Three operations establish the surface. Each requires its negotiated
`co.grida/config/` capability, and unknown parameters are rejected.

| Method                     | Parameters                                                | Result                                                                                                                              |
| -------------------------- | --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `_co.grida/config/inspect` | None (`{}`).                                              | Field definitions, current file revision, active defaults, and file diagnostic.                                                     |
| `_co.grida/config/update`  | `expectedRevision` and one typed `change` (set or reset). | The published active configuration snapshot.                                                                                        |
| `_co.grida/config/reload`  | `expectedRevision`.                                       | Validates manually edited content and activates it for future requests, or returns diagnostics while retaining the active snapshot. |

`expectedRevision` is the file revision from inspection, a fingerprint written
as 64 lowercase hexadecimal characters. It is null exactly when no
configuration file exists; any other mismatch fails with
`config_revision_changed`. A `change` carries one of these operations.

- `set_model_context_window` with a positive integer `value`.
- `reset_model_context_window`.
- `set_model_auto_compact_token_limit` with a positive integer `value`.
- `reset_model_auto_compact_token_limit`.

The inspection response reports each field's key, label, meaning, type,
units, bounds, default rule, scope and activation timing. Its
`exact_input_counting` value reports a provider compatibility capability for
older work.

Reset removes the selected override. It uses the same update operation and
validation path. Unknown keys, unsupported schema versions, and invalid types
produce explicit errors. The complete candidate file is validated before any
write.
The caller cannot supply an arbitrary file path, TOML fragment, or unreviewed key.

These operations are client features for a person's own tooling; the agent
never receives them.

## Agent edits

The host keeps `config.toml` in protected storage. People edit the file
directly or use the managed operations through a trusted ACP client.

Earlier accepted inputs can retain access to the exact
`agent-settings/config.toml` target. The host revalidates that earlier grant
when resuming or recovering the turn. A retained write or edit still requires
its exact-action approval. The settings owner validates the complete content,
detects concurrent edits, publishes atomically, and activates the result for
later inputs. Accepted work keeps its captured defaults.

Use standard ACP session configuration for advertised selectors whose scope and
semantics match. Its current select/negotiated-boolean options do not express
this arbitrary numeric, host-global file contract. Persistent defaults therefore
use the host-configuration extension in the [client protocol binding](./rust-client-protocol.md).
Changing a session selector remains distinct from changing future defaults.
[ACP session configuration](https://agentclientprotocol.com/protocol/v1/session-config-options).

## Persistence and activation

The file revision fingerprints the exact source used for the edit. Managed
updates serialize under the host's configuration writer, compare the expected
revision, validate the complete candidate, atomically replace the file, and
publish the resulting configuration snapshot. Unrelated supported fields and
comments are preserved. A stale revision returns a conflict for inspection and
reconsideration.

A lost write acknowledgment is reconciled through inspection of the revision
and requested values. Retrying the same desired state cannot create additional
work. The file update and session database are separate persistence boundaries.
Capturing settings for accepted work uses the actual validated snapshot.

Manual file edits are supported at startup and through reload. The host runs
no file watcher. Invalid startup configuration prevents
execution with a useful diagnostic. A rejected reload leaves the running host's
last valid snapshot active and makes the rejected source visible. It never
silently claims that invalid edits took effect.

Inspection is observational. It distinguishes the current file revision from
the active validated snapshot, including when a manual edit is awaiting reload
or has failed validation. Updates use the file revision as their precondition.
Accepted work identifies the validated snapshot it actually used.

Concurrency protection covers managed updates. Arbitrary editors do not take
the host's writer lock, so atomic replacement alone cannot promise conflict-free
editing with every external writer. The manual workflow edits a stopped host or
uses an explicit reload after editing. Detected external changes reject stale
managed updates. Writes retain the normal host path and integrity checks.

## Acceptance obligations

| Situation                                                    | Required observation                                                                                  |
| ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| Ask which context setting applies                            | Return the effective value or automatic rule, source, scope, and activation timing.                   |
| Ask for a supported persistent change                        | Update through the normal configuration capability and confirm the actual resulting state.            |
| Ask for a one-task change                                    | Use an explicit request/control override or explain its availability, preserving persistent defaults. |
| Set an invalid value or unknown field                        | Report the error and preserve the valid configuration.                                                |
| Two clients edit from the same revision                      | One managed update wins and the other receives a conflict.                                            |
| Restart after a valid change                                 | Load the same persisted override and expose its provenance.                                           |
| Change defaults while work is queued                         | Accepted work retains its captured configuration.                                                     |
| Select a model with less capacity than the configured window | Use the model's smaller window and cap the automatic compaction threshold accordingly.                |
| Reload a malformed manual edit                               | Keep the last valid running snapshot and report the rejected source.                                  |

## Design rationale

Context limits resolve against the model binding at input acceptance. A user
can lower the working window, or supply one when the provider's metadata is
unknown. Revision-checked writes keep one validated update path. Captured
snapshots preserve the accepted context policy when later defaults change.
