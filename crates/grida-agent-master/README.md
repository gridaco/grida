# Grida agent master

Conversational product policy over `agent-kit-runtime`. The master selects model
input, tools, bounded continuation, and a persistent completion account. Providers,
execution authority and tool implementations are supplied by its host.

Continuation records retain the prepared request before execution. Publishing
conversation history and the next continuation is atomic, so restart can reuse
recorded operations without repeating their effects. Runtime and storage retain
their own execution and ownership contracts.

The host can supply preceding conversation history as an immutable projection.
It is included in model context without copying it into each turn's records.
The continuation identity includes this projection so recovery cannot silently
replace the context on which the turn was based.

Pause-origin interruptions remain distinguishable after a rapid resumption.
Stopping accounts for unfinished operations and publishes recorded effects into
the conversation before settlement. Completion and suspension validate the
control and history positions on which the master made its decision.

Completion accounts expose typed output-limit, refusal, and step-limit reasons
for client adapters. Reviewed default-setting definitions live here, while the
native host owns their persistence and user operations.

A supplied hard input limit measures the complete prepared provider request.
It requires an exact count or conservative bound before dispatch. An unavailable
counter, estimate, or excessive input produces a persisted failed account.
Automatic budgeting leaves that optional measurement to the selected policy.
