# agent-kit-sessions

Durable input acceptance and execution ownership around an injected turn driver.
The service exposes explicit creation, submission, selection, controls, recovery,
and inspection. Scheduling and submission decoding belong to its consumer.

`SessionStore` owns atomic persistence and unique lease issuance. A driver receives
a core `TurnLease` and returns a settlement or suspension receipt. The service
verifies that receipt against storage before reporting the outcome. Inspection
and repeated claims issue no execution lease.

Queue edits are conditional controls. Replacement preserves the original input
and assigns a fresh immutable identity to the revised content. Withdrawal keeps
the input's recorded disposition. Reordering supplies the complete current queue
order. Claim and edit cannot both win the same session revision.

History contributions use an explicit turn, control revision and history
position. A response can resolve its interaction and append correlated history
in the same transaction. The consumer validates response meaning and chooses
the contribution's role and provenance.

Resuming a user-paused turn can clear that pause and acquire its next lease
atomically. The operation requires the observed suspension, control revision,
and released owner. Other waits and session admission controls remain effective.

This crate depends on the shared core. Runtime, databases, providers, transports,
and product policy are supplied independently.
