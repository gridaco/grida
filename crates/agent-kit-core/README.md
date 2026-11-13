# Agent Kit Core

Shared values and contracts for model inference, tool invocation, conversation
history, context assembly, authority references, and durable turn records.

Providers and tools can be used directly. History and Context are pure local
operations. The host supplies journal adapters, authority validation, provider
connections, and execution capabilities. Product decisions, credential custody,
filesystems, transport, database access, and document semantics have separate
owners.

## Public boundaries

| Module         | Responsibility                                                                                                    |
| -------------- | ----------------------------------------------------------------------------------------------------------------- |
| `messages`     | Conversation content, provenance, media references, and tool-call correlation.                                    |
| `inference`    | Validated model requests, provider contracts, streamed output, terminal evidence, and usage observations.         |
| `tools`        | Captured definitions, shared preflight, invocation, and executor-declared recovery.                               |
| `history`      | Ordered records, atomic append, and source-preserving views and forks.                                            |
| `context`      | Pure assembly and explicit measurement against supplied input limits.                                             |
| `authority`    | Host-issued identities and a current-authority validation port.                                                   |
| `turn`         | Conditional state transitions, operation evidence, controls, and journal bindings.                                |
| `driver_state` | Opaque, revisioned driver state carried across turns, replaced conditionally on its revision and bounded in size. |

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
produces an interrupted result with the available partial content: consecutive
text or reasoning deltas form one content element, and streamed provider state
stays with the message it belongs to. Validation checks every media input against
the model's input modalities, including media returned in tool results. Usage
observations name their category and unit from the shared `inference::usage`
vocabulary. One bounded
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
independently of its original admission positions. A change may carry at most one
`SetDriverState`. It applies only against the expected driver-state revision,
fails with `driver_state_revision_changed` otherwise, holds at most 64 KiB, and
its receipt reports the new revision.

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
handle records pause, resume, cancellation, and correlated answers at the current
journal position, so concurrent driver commits do not make them stale. They
conflict only when their expected control revision has moved. Releasing a
waiter does not remove its recorded interaction. The latest interruption revision
survives Resume so a coalesced control notification still identifies the scopes
that must stop.

## Context measurement

Context assembly and history projection are optional. A host may assemble model
input itself and rely on `validate_exchanges` and provider preparation alone.

The caller supplies history selection, extra material, transformations, and
measurement. The assembled snapshot keeps one source position per message, with
none for supplied extra material. `KeepLast` trimming that would split a tool
exchange is rejected rather than repaired.
Estimated counts cannot satisfy a requested hard ceiling. Separately measured
non-message overhead does not establish an exact combined encoding bound.
Provider preparation owns validation of the final provider representation.
`Provider::measure_input` optionally measures the complete prepared input from
local information. The caller checks its reported measurement kind against its
requested limit.

## Verification

Run `cargo test -p agent-kit-core --locked` for the independent contract tests and
`cargo clippy -p agent-kit-core --all-targets --locked -- -D warnings` for lint checks.
