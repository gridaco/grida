# Agent Kit Core

Shared values and contracts for model inference, tool invocation, conversation
history, context assembly, authority references, and durable turn records.

Providers and tools can be used directly. History and Context are pure local
operations. The host supplies journal adapters, authority validation, provider
connections, and execution capabilities. Product decisions, credential custody,
filesystems, transport, database access, and document semantics have separate
owners.

## Public boundaries

| Module      | Responsibility                                                                                            |
| ----------- | --------------------------------------------------------------------------------------------------------- |
| `messages`  | Conversation content, provenance, media references, and tool-call correlation.                            |
| `inference` | Validated model requests, provider contracts, streamed output, terminal evidence, and usage observations. |
| `tools`     | Captured definitions, shared preflight, invocation, and executor-declared recovery.                       |
| `history`   | Ordered records, atomic append, and source-preserving views and forks.                                    |
| `context`   | Pure assembly and explicit measurement against supplied input limits.                                     |
| `authority` | Host-issued identities and a current-authority validation port.                                           |
| `turn`      | Conditional state transitions, operation evidence, controls, and journal bindings.                        |

Identities validate at construction and deserialization. Prepared requests and
invocations retain their exact definition and data fingerprints. Adapter-owned
opaque values use versioned, bounded envelopes.

## Inference and tools

A provider validates its own settings and authority before creating a
`PreparedRequest`. Preparation performs no network request. `InferenceRun` creates
a child cancellation scope and passes that same control to its stream factory.
Direct callers supply an attempt identity. Runtime supplies its admitted attempt
identity so adapters can correlate usage, call identifiers, and receipts.
An adapter must apply its supplied transport deadline. A missing terminal event
produces an interrupted result with the available partial content. One bounded
provider receipt may arrive before the terminal event and is retained with an
interrupted or limited result.

An `InventorySnapshot` captures executable definitions. Its `prepare` and
`restore` methods check the argument representation and call the executor's
side-effect-free validator. Execution checks that the definition still matches.
Each invocation receives a child cancellation scope and bounded output allowance.
Output truncation preserves the actual operation status and recovery receipt.

An executor implements its own recovery contract. The default recovery result is
uncertain. Retrieving or reconciling prior work and intentionally executing new
work have separate identities and paths.

## Journals and ownership

`TurnState::apply` validates a complete change before publishing its in-memory
result. It records stable change, operation, and attempt identities. Replaying an
identical change returns its receipt. Reusing that identity for different content
is a conflict. The content fingerprint additionally identifies the action payload
independently of its original admission positions.

A prepared operation can be rejected before dispatch without inventing a physical
attempt. Tool work originating in a model response retains its source inference
and original call identity before effects. Unknown outcomes require reconciliation. Reconciliation retains the
previous outcome evidence. A settled turn admits no more work. It can retain late
reconciliation evidence for an existing uncertain attempt while preserving its
terminal account, history, and controls. Those updates return ordinary recorded
receipts rather than another settlement receipt.

Storage adapters persist the validated state and receipt atomically. A receipt
value becomes durability evidence only when its issuing store verifies it.
`bind_lease` checks journal/control binding identities. The adapter owns exclusive
writer issuance and keeps its ownership guard alive with the bound journal.
Recovery establishes prior ownership release before rebinding to a new epoch.

`EphemeralJournal` supplies the same contract in memory. Its separate control
handle records pause, resume, cancellation, and correlated answers. Releasing a
waiter does not remove its recorded interaction. The latest interruption revision
survives Resume so a coalesced control notification still identifies the scopes
that must stop.

## Context measurement

The caller supplies history selection, extra material, transformations, and
measurement. Trimming that leaves an invalid tool exchange fails explicitly.
Estimated counts cannot satisfy a requested hard ceiling. Separately measured
non-message overhead does not establish an exact combined encoding bound.
Provider preparation owns validation of the final provider representation.
`Provider::measure_input` optionally measures the complete prepared input from
local information. The caller checks its reported measurement kind against its
requested limit.

## Verification

Run `cargo test -p agent-kit-core --locked` for the independent contract tests and
`cargo clippy -p agent-kit-core --all-targets --locked -- -D warnings` for lint checks.
