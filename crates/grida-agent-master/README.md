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
The continuation identity covers this projection, the master configuration,
the input limit, and any completion checks or lifecycle hooks, so recovery
cannot silently replace the context or policy on which the turn was based.

Image attachment policy stays in the product composition. The host accepts an
explicit image as immutable prepared media and retains its original separately.
The master projects the product image context into source-path or managed
snapshot provenance and bounded-view/frame disclosure without adding those
descriptions to the person's transcript. For a text-only continuation, earlier
image pixels become an explicit uninspected-image note; tool call/result
correlation is preserved and retained originals remain available to clients.
New unsupported image intake is refused by the host before acceptance.
An exact durably cancelled turn can still settle when that execution is no
longer available: it reuses the retained continuation only to retire recorded
work and publish cancellation, without dispatching provider or tool work.
Recorded effects, uncertainty and funding remain accounted under their original
identities.

Pause-origin interruptions remain distinguishable after a rapid resumption.
Only a person's Pause or Stop replaces a cut-off response in model context; a
deadline or provider interruption leaves the published response in place. A
request prepared after resumption is not treated as paused, so its own
interruption ends the turn as uncertain.
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

A temporary failure with positive evidence that execution could not start can
reserve one retry within the turn's remaining inference steps. For a verified
rate-limit rejection, the master needs usable delay advice and waits between
250 milliseconds and five seconds. For a proved connection refusal, it waits
250 milliseconds. The master retains the due time, provider, principal, scope,
and selected grant IDs. The delay holds no inference permit, survives restart,
and remains subject to Pause and Stop. A reopened host revalidates its live
authority before dispatch. The retry requires no output or reported usage from
the failed attempt. A rate-limit delay above five seconds, missing or unsupported
advice, changed authority, and uncertain dispatch end without automatic retry.

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
deferral. One call groups one to three questions in a single durable wait. The
person can choose a suggested answer, write a reply, or skip each item. Their
schema and reply validation live with the tools. The host chooses which styles
to offer and how to deliver questions to its clients. An optional batch expires
at turn settlement. A batch accepted beforehand enters the next model decision
as a correlated user message. Awaited answers reach the model in a tool result.
Both styles preserve the attributed questions and answers in the transcript.

Effort policy selects a turn's parent generation allowance within a
host-supplied total. Standard uses the direct allowance. Ultra requires an
already funded independent assignment and a matching offered tool. It reserves
that assignment's generation steps from the same total and instructs the model
to delegate useful work and integrate the findings. Tool permissions, Plan or
Act, model choice and per-request output limits remain independent. A retained
Ultra continuation requires the original policy and a matching live offer to
continue. Stop can preserve the recorded results without the offer. Goal work
with a parent-only reservation cannot draw on a separate child allowance.
An Ultra Goal reservation divides the same inference allowance between the
parent and one funded review. Settlement charges their recorded attempts
once. An unsettled review retains the reservation until both turns can be
accounted.

General delegation is a separate captured product policy, independent of effort.
The host supplies bounded spawn, informational message, wait and stop tools and
retains their selected definitions and authority with the accepted input. The
master adds assignment and integration instructions without constructing child
sessions or their adapters. It derives completion evidence from recorded tool
receipts: a child session, accepted input and execution turn identify one
assignment, and only a matching authoritative terminal result satisfies it.
A premature answer receives the remaining model steps to collect or stop
outstanding work. Exhaustion produces an incomplete account; uncertain child
effects remain uncertain. Task outcomes and owned-resource retirement have
separate evidence: a later authoritative retirement proof can resolve resource
uncertainty without rewriting the task outcome. Failed or cancelled child work
can still be integrated honestly by the parent. The policy captures a separate bounded child allowance,
which does not reset with names or new children. The host enforces that allowance
and supplies the children's declared capabilities; the policy adds no grants.
Worker processes belong to their assignment and stop before its result can be
collected with verified resource retirement. The native host automatically
retires remaining assignment-owned processes at completion; a worker can leave
a bounded process running when its assignment requires that, reporting its
session identity and last observed state. It need not stop the process merely
to finish or wait for expiry. Worker observations do not substitute for native
retirement receipts, and unverified cleanup remains uncertain. The host supplies
that settlement barrier; the parent must own any work intended to continue
beyond the assignment.
General worker policy is unavailable for reserved Goal work until its worker
share has an explicit cumulative accounting contract. An existing Stop still
settles without admitting further work.

Completion accounts expose typed output-limit, refusal, and step-limit reasons
for client adapters. Provider failure classifications remain available in the
account, with context exhaustion separate from output-limit exhaustion.
An inference the provider did not confirm, such as a stream that ends before
its terminal event, ends the turn with an uncertain account; the conversation
stays available for a new message. A tool call whose arguments are not one
JSON object, like a call to an unavailable tool, receives a correctable failed
result and the turn continues; repeated failures end at the step limit.
Every account counts tool operations by their recorded final disposition.
Recovered and stopped turns retain successful partial work without counting a
replay twice.
Reviewed default-setting definitions live here, while the
native host owns their persistence and user operations.

The master resolves the automatic compaction threshold from the captured
settings and model window. It uses provider-reported context usage and
estimates added material to decide when to summarize. Actual context limits
are enforced by the selected provider.

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

Completion-check policy runs captured, ordered handler revisions against one
successful candidate. The host supplies reviewed handler inventory and current
grants. Required failures block the candidate and observational failures remain
diagnostic. An interrupted handler retains its recorded uncertainty. Recovery
uses the original candidate and result without repeating effects. The caller
settles against the original control and history positions and adds check
evidence to the final account after review. Handler registration and executable
dispatch stay with the host.

Lifecycle policy additionally selects ordered session-start, accepted-input,
pre-tool, post-tool and completion handlers. Each invocation retains its full
ordered definition selection and exact event occurrence. A required rejection
skips later checks; observational failures retain diagnostics. Post-effect
checks preserve the actual outcome. Context is bounded, source-attributed data,
kept separate from user instructions and execution authority. Completion can
request another step only within the turn's effective step allowance, after
goal, delegation and approval-review reservations. Private checks are ordinary
durable operations, excluded from recursive hook dispatch: the master recognizes
them from the hook and completion-check handlers and the admission-check grant
it was given. Reads
and reconnect never execute them. The host owns trusted registration, executable
review, live grants and native confinement.
