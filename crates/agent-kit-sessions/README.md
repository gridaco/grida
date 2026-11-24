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

A queue checkout holds one input outside runnable admission and reserves its
position and capacity. One checkout can remain open per session. Restoring
it returns the original input. Saving revised content accepts a new immutable
input in the reserved position. Both consume the checkout and retain a receipt.
A transfer consumes a waiting input and appends the supplied contribution to
the exact running turn in one transaction. The original turn claim and its
selected inputs remain the authority for resuming that turn.

History contributions use an explicit turn, control revision and history
position. A response can resolve its interaction and append correlated history
in the same transaction. The consumer validates response meaning and chooses
the contribution's role and provenance.

Resuming a user-paused turn can clear that pause and acquire its next lease
atomically. The operation requires the observed suspension, control revision,
and released owner. Other waits and session admission controls remain effective.

This crate depends on the shared core. Runtime, databases, providers, transports,
and product policy are supplied independently.
