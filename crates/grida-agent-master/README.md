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

User input arriving after a prepared request is incorporated before a successful
turn settles. An unanswered interaction preserves the unfinished turn through
suspension, releasing the worker until an explicit resumption.

A prepared request can be retired for new input, a pre-dispatch Pause, or
renewed execution authority only when it has no dispatched attempt. Authority
renewal preserves its provider, principal and scope. Its replacement receives a
new operation identity and preserves the inference-step allowance. Dispatched attempts retain their recorded
outcomes and uncertainty, including when new input races settlement.

The model history projection places responses before corrections absent from
their prepared requests. It retains published content and tool exchanges while
the journal preserves receipt order. Hosts can use the same projection for
preceding turns.

Conversation seeds select a committed prefix for a new conversation or an
earlier user-message revision. They carry portable conversation text, historical
tool dispositions and source provenance. The omission ledger identifies source
instructions, raw tool data, media and opaque provider state that did not carry
forward. The original execution records remain available in their source view.

Turn-bound question tools support immediate registration and answer-dependent
deferral. Responses can be a suggested choice, free text, or a skip. Their
schema and reply validation live with the tools. The host chooses which styles
to offer and how to deliver questions to its clients.

Completion accounts expose typed output-limit, refusal, and step-limit reasons
for client adapters. Provider failure classifications remain available in the
account, with context exhaustion separate from output-limit exhaustion.
Reviewed default-setting definitions live here, while the
native host owns their persistence and user operations.

A supplied hard input limit binds to the complete prepared provider request.
It requires an exact count or conservative bound before generation. A remote
counter receives that input under the selected provider authority. An unavailable
counter, estimate, or excessive input produces a persisted failed account.
Automatic budgeting leaves that optional measurement to the selected policy.

Inference usage is derived from recorded attempts. Newer cumulative observations
replace older values for the same source, category, and unit. Missing reports
remain explicit, and cached usage stays in its own category. Prices and spending
authority are supplied by the host separately.

Goal policy retains an explicit objective, success criteria, revision, progress,
and cumulative work-turn and inference-step allowances. Each reservation is
bound to its exact turn. Uncertain work retains the reserved allowance until
reconciled. A changed goal can account for older work while rejecting its
progress or completion proposal. Completion requires a verified evidence link
for every criterion. `goal_inspect` reads the state captured for reserved work.
`goal_report` records a proposal bound to the exact goal revision, turn, and
operation. The master limits the reserved turn, accounts for recorded attempts,
and commits the result with the goal update. A completion claim cites recorded
tool calls. An explicit verifier must establish their relevance to each
criterion. The host still supplies tool grants and automatic continuation.

Timed continuation policy records one wake-up for an existing task. The
prepared tool waits without a worker or inference request. Its due time is
fixed at first registration, and the same recorded answer can be replayed.
Pause holds due delivery. Cancel Wake-up clears automatic delivery, while
Stop closes the task's admission. The host supplies a clock, grants and timer
delivery, and claims any continuation through the usual task controls.
