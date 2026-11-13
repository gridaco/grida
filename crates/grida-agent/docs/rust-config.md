# Agent host configuration

The native host provides a small typed configuration surface shared by Desktop,
headless clients, and agent tools. A person can ask the agent to explain a setting,
change a supported default, or restore its inherited value. TOML is the editable
backing format. Conversational changes use the same validated host operations as
other clients.

The native host implements the file, client operations and model-facing tools
below. Existing model and mode selectors retain their separate settings
contracts.

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

The host's configuration module implements the service and constructs its
capability-scoped tools from the master's field definitions. The master selects
those tools through its ordinary inventory. This keeps the dependency from host
to master and avoids a second settings path inside the agent loop.

## Field review

| Field                              | Meaning                                                                                                    | Default and bounds                                                                                                                                                                                                                                                                       | Status                   |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| `schema_version`                   | Version of this file's schema.                                                                             | Required version `1` when the file exists.                                                                                                                                                                                                                                               | Format metadata.         |
| `context.max_input_tokens`         | Upper limit on the complete assembled model input, including instructions, history, and tool declarations. | Omitted means automatic product/model budgeting. Explicit values are integers from `1` through `9007199254740991`, preserving exact values across native and JavaScript clients. Effective input is also capped by provider capacity after output/headroom reservations and host limits. | Reviewed behavior field. |
| Automatic-compaction threshold     | When the master should summarize or replace context.                                                       | Requires a separate definition of measured scope and interaction with the input budget.                                                                                                                                                                                                  | Not reviewed.            |
| Provider context-window correction | Replace stale or missing model-capacity metadata for a specific provider/model binding.                    | Needs provenance, known-maximum handling, and explicit treatment of unverified capacity.                                                                                                                                                                                                 | Not reviewed.            |

The behavior field controls how much input the agent tries to use. Raising
it can increase cost and admit more context, subject to available model capacity.
It does not increase the model's actual capacity or grant more spending authority.
If the capacity is unknown, inspection reports that uncertainty. A numeric local
budget cannot establish provider compatibility.

An explicit value replaces the preferred automatic budget. The effective
ceiling is the smaller of that value and the available provider/host capacity.
For example, a 64k cap remains valid when a selected model permits only 32k input.
Inspection shows the requested 64k, effective 32k, and limiting constraint.

Admission checks the complete input against the resolved ceiling. The accounting
includes media, tool declarations, and provider framing, with the measurement
bound to their captured representation. An estimate remains labeled as such.
A requested hard bound requires exact counting or a conservative upper bound.
When it
cannot fit, the master compacts within policy, requests a change, or reports
the unavailable request. A changed model is revalidated. The accepted requested
cap and each operation's actual resolved limit remain attributable.

Example file using an illustrative value that must fit the selected model.

```toml
schema_version = 1

[context]
max_input_tokens = 64000
```

Removing `max_input_tokens` restores automatic budgeting. Zero has no special
reset meaning. Credentials, access grants, sandbox rules, and spending limits
have their existing owners and are excluded from this schema.

## Hook definitions

The [hook behavior contract](https://grida.co/docs/wg/ai/agent/hooks) defines
execution boundaries. Trusted native profiles select up to eight ordered
`session_start`, `before_input`, `before_tool`, `after_tool`, or
`before_completion` checks. Each binds a canonical system executable and digest,
literal arguments, source, required/observe behavior, timeout and captured
read-only command scope. Executable and ancestor ownership and ACL checks remain
mandatory. User-owned programs require a separate custody contract.

Desktop workspace registration uses explicit native trust and a separate private
registry. Saved changes activate on a new connection; accepted work retains its
captured policy. A changed capture cannot resume paused work. Stop and inspection
remain available without rerunning checks. Checks can run in Plan or Act when
the task already has the required read scope. A text-only child gains no scope
merely to execute a check. Project and plugin discovery is deferred to a source
adapter with review of new or changed executable content.

The user-writable configuration service keeps its scalar setting. Hook
registration, inspection, and editing through that service require a separate
field review. Executable trust remains a distinct user or host decision.
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

| Method                     | Parameters                                                | Result                                                                                                                                                     |
| -------------------------- | --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `_co.grida/config/inspect` | None (`{}`).                                              | Reviewed field descriptions, stored override, requested and effective values, default and source, current file revision, active snapshot, and diagnostics. |
| `_co.grida/config/update`  | `expectedRevision` and one typed `change` (set or reset). | The resulting file revision and active snapshot, persisted and effective values, and diagnostics.                                                          |
| `_co.grida/config/reload`  | `expectedRevision`.                                       | Validates manually edited content and activates it for future requests, or returns diagnostics while retaining the active snapshot.                        |

`expectedRevision` is the file revision from inspection, a fingerprint written
as 64 lowercase hexadecimal characters. It is null exactly when no
configuration file exists; any other mismatch fails with
`config_revision_changed`. A `change` carries `operation`
(`set_context_max_input_tokens` with a positive `value`, or
`reset_context_max_input_tokens`).

Each field descriptor provides its name, human label, meaning, type, units,
default rule, supported scope, validation, activation rule, and whether the
caller may change it. The agent sees this bounded description when needed.
Comments and arbitrary file text never become configuration instructions.

Reset removes the selected override. It uses the same update operation and
validation path. Unknown keys, unsupported schema versions, and invalid types
produce explicit errors. The complete candidate file is validated before any
write.
The caller cannot supply an arbitrary file path, TOML fragment, or unreviewed key.

Desktop controls, protocol clients, and model-facing tools share these operations.
The agent's tools are ordinary capability-scoped invocations recorded by Runtime.
The master changes persistent settings in response to an explicit user request.
The configuration capability restricts writable fields and scope, and conveys
no authority to alter unrelated files or execution limits.

Native clients can offer inspection by negotiating `co.grida/config/inspect`.
Offering the mutation tools also requires the update and reload capabilities,
plus an explicit `allowConfigurationChanges: true` on that accepted submit,
enqueue or replacement request. The host retains this permission with the
input. A reconnect preserves the accepted permission. An ordinary prompt or a
model-generated tool argument cannot upgrade it. Read and change grants have
separate identities and are checked against the selected operation.

Managed tool changes return the exact snapshot produced by that write. Recovery
inspects the requested postcondition and labels a matching state as observed
after recovery. A differing or invalid state remains uncertain. Recovery performs
no new write. Cancellation is checked at the final publication boundary, and a
begun publication remains owned through its result.

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

## Conversational behavior

For “use at most 64k input tokens for future tasks,” the agent inspects the field,
checks the value and scope, and applies a typed update. It reports the previous
and resulting values, what the number controls, and that future accepted work
uses the new default. It reports an error when the change is rejected.

For “why did you use less context,” the agent inspects the configuration captured
for that work and explains the effective limit, its source, and any provider or
budget restriction. It distinguishes that past snapshot from current defaults.

For “restore automatic context budgeting,” the agent resets the override and
reports the inherited default rule. The person does not need to know the file
path or field spelling for any of these operations.

The agent learns this supported surface through field descriptors and tool
definitions. It does not infer writable settings from repository code, invent
keys, or rewrite configuration through an unrestricted shell tool.

## Acceptance obligations

| Situation                                                 | Required observation                                                                                  |
| --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Ask which context setting applies                         | Return the effective value or automatic rule, source, scope, and activation timing.                   |
| Ask for a supported persistent change                     | Update through the normal configuration capability and confirm the actual resulting state.            |
| Ask for a one-task change                                 | Use an explicit request/control override or explain its availability, preserving persistent defaults. |
| Set an invalid value or unknown field                     | Report the error and preserve the valid configuration.                                                |
| Two clients edit from the same revision                   | One managed update wins and the other receives a conflict.                                            |
| Restart after a valid change                              | Load the same persisted override and expose its provenance.                                           |
| Change defaults while work is queued                      | Accepted work retains its captured configuration.                                                     |
| Select a model with less capacity than the configured cap | Show the smaller effective ceiling and its source before assembling the request.                      |
| Reload a malformed manual edit                            | Keep the last valid running snapshot and report the rejected source.                                  |

## Design rationale

The configuration surface is a working-input budget, not a model-capacity
override. Model capacity is provider metadata with its own provenance; a local
number cannot raise it. Keeping the budget a user default with explicit
revisions lets a person, a client, and the agent change it through one
validated path, inspect where an effective value came from, and see when a
concurrent edit lost. Typed changes keep the agent from rewriting arbitrary
configuration, and captured snapshots keep accepted work reproducible after a
default changes.
