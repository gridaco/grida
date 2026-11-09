# Agent configuration proposal

The native host provides a small typed configuration surface shared by Desktop,
headless clients, and agent tools. A person can ask the agent to explain a setting,
change a supported default, or restore its inherited value. TOML is the editable
backing format. Conversational changes use the same validated host operations as
other clients.

This is a design proposal. The field below is a candidate for review before
implementation. Existing model and mode selectors remain evidence of separate
settings, without defining the new file's schema.

## Initial scope

Use one host-owned file at `<state-dir>/config.toml`, with an explicit schema
version. The first persistent scope is this user's agent defaults on this host.
Explicit per-request overrides already belong to accepted input. Project-file
inheritance, named profiles, environment expansion, and a universal settings
framework are outside the first version.

Field definitions belong to `grida-agent-master`. The native host owns parsing,
storage, update serialization, and protocol exposure. Core components receive
resolved limits and configuration identity through their existing contracts.
No configuration crate or TOML dependency is required in the neutral core.

The host's configuration module implements the service and constructs its
capability-scoped tools from the master's field definitions. The master selects
those tools through its ordinary inventory. This keeps the dependency from host
to master and avoids a second settings path inside the agent loop.

## Field review

| Field                              | Proposed meaning                                                                                           | Default and bounds                                                                                                                                                                                                                            | Status                         |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| `schema_version`                   | Version of this file's schema.                                                                             | Required version `1` when the file exists.                                                                                                                                                                                                    | Format metadata.               |
| `context.max_input_tokens`         | Upper limit on the complete assembled model input, including instructions, history, and tool declarations. | Omitted means automatic product/model budgeting. Explicit values are positive integers representable by TOML's signed 64-bit integer. Effective input is also capped by provider capacity after output/headroom reservations and host limits. | First reviewed behavior field. |
| Automatic-compaction threshold     | When the master should summarize or replace context.                                                       | Requires a separate definition of measured scope and interaction with the input budget.                                                                                                                                                       | Review later.                  |
| Provider context-window correction | Replace stale or missing model-capacity metadata for a specific provider/model binding.                    | Needs provenance, known-maximum handling, and explicit treatment of unverified capacity.                                                                                                                                                      | Review separately.             |

The first behavior field controls how much input the agent tries to use. Raising
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
have their existing owners and are excluded from this initial schema.

## Hook definitions

Hooks add a structured configuration surface after the initial scalar setting.
Their [behavior contract](https://grida.co/docs/wg/ai/agent/hooks) defines the
execution boundaries. The host owns registration, inspection, enable/disable,
and trust through the same validated configuration service. Hook definitions
have a separate field review before entering the writable schema.

Review event names, exact matchers, command/executable binding, source and
revision, scope, timeout, output/context bounds, required-check behavior, and
activation timing before enabling registration. Start with explicit user
definitions and command handlers. Project/plugin discovery is a later source
adapter with review of new or changed executable content. Accepted work keeps
its selected definitions, while revocation still takes effect before execution.

The agent can explain or prepare a requested definition through typed host
operations. Executable trust remains a distinct user/host decision. Provider
credentials and execution authority retain their separate custody. The concrete
file representation and operation schema are fixed with the hook slice.

## Effective configuration

Resolution starts with versioned product defaults, applies this host's validated
user overrides, then applies explicit request overrides. Host requirements and
provider constraints bound the result independently of that precedence.

Accepted work captures the resolved configuration and its source identities.
Changing a persistent default applies to later accepted requests. Already queued
work retains its captured settings. Changing active or queued work uses its
explicit control or replacement operation, with renewed validation.

The first configuration writer updates user defaults only. It never turns a
request limited to one task into a persistent global change. When the requested
scope is ambiguous, the master resolves that ambiguity before writing. Additional
persistent scopes require their own field and precedence review.

## Shared host operations

Three small operations establish the surface. These are logical service names.
Their ACP wire names use the negotiated `_co.grida/` extension namespace.

| Operation        | Input                                                                        | Result                                                                                                                                                                           |
| ---------------- | ---------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `config.inspect` | Optional supported keys and an optional request/session to explain.          | Reviewed descriptions, stored override, requested/effective values, default/source, current file revision, active snapshot identity, diagnostics, bounds, and activation timing. |
| `config.update`  | Expected file revision and a bounded list of typed `set` or `reset` changes. | Validated changes, resulting file revision and active snapshot, persisted/effective values, diagnostics, and activation timing.                                                  |
| `config.reload`  | Expected current file revision.                                              | Validate manually edited content and activate it for future requests, or return diagnostics while retaining the active snapshot.                                                 |

Each field descriptor provides its name, human label, meaning, type, units,
default rule, supported scope, validation, activation rule, and whether the
caller may change it. The agent sees this bounded description when needed.
Comments and arbitrary file text never become configuration instructions.

Reset removes the selected override. It uses the same update operation and
validation path. Unknown keys, unsupported schema versions, and invalid types
produce explicit errors. Changes are validated as a group before any write.
The caller cannot supply an arbitrary file path, TOML fragment, or unreviewed key.

Desktop controls, protocol clients, and model-facing tools share these operations.
The agent's tools are ordinary capability-scoped invocations recorded by Runtime.
The master changes persistent settings in response to an explicit user request.
The configuration capability restricts writable fields and scope, and conveys
no authority to alter unrelated files or execution limits.

Use standard ACP session configuration for advertised selectors whose scope and
semantics match. Its current select/negotiated-boolean options do not express
this arbitrary numeric, host-global file contract. Persistent defaults therefore
use the host-configuration extension in the [client protocol proposal](./rust-client-protocol.md).
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

Manual file edits are supported at startup and through `config.reload`. The
first version needs no file watcher. Invalid startup configuration prevents
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

## Reference and deliberate differences

Codex exposes a TOML configuration reference, context-window and compaction
settings, and a distinction between user preferences and managed requirements.
[Official configuration reference](https://learn.chatgpt.com/docs/config-file/config-reference).

The inspected source exposes effective values and origins through config reads,
and validated writes with version checks. Its context-window override affects
model metadata and is bounded by a known maximum. That serves a different purpose
from the proposed working-input budget above.
[Config contracts](https://github.com/openai/codex/blob/6107b9886c114702e5c1cfd1c1b54f7c48bfaf49/codex-rs/app-server-protocol/src/protocol/v2/config.rs),
[write validation](https://github.com/openai/codex/blob/6107b9886c114702e5c1cfd1c1b54f7c48bfaf49/codex-rs/app-server/src/config_manager_service.rs),
[model override](https://github.com/openai/codex/blob/6107b9886c114702e5c1cfd1c1b54f7c48bfaf49/codex-rs/models-manager/src/model_info.rs).

The conversational configuration tools are our proposed product behavior. The
config APIs establish a reference for inspection and controlled updates. Our
agent-mediated workflow is a separate product requirement.
