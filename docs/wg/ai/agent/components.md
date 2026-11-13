---
title: Agent Components
description: Proposed boundaries for messages, inference, tools, history, context, live execution, and durable sessions, with explicit dependencies and independently testable contracts.
keywords: [agent, components, runtime, sessions, inference, history, durability]
format: md
sidebar_position: 3
tags: [internal, wg, ai, architecture]
---

# Agent Components

This proposal defines a reusable agent component kit. The starting point is
seven specific responsibilities with small contracts. Each can be understood
and tested at its own level. Product judgment belongs to the
[master](./master.md), and user-visible promises belong to the
[experience contract](./experience.md).

A component is deliberately ignorant of the user's task while being precise
about its own operation. Inference understands model requests. Tools understand
invocations. Runtime understands a live agent turn. Sessions understands
accepted work and durable ownership. Their usefulness comes from these concrete
semantics and from the ability to compose them independently.

## Layers and names

These names identify logical domains. Several domains can share an implementation
unit. Public APIs and packaging require evidence from actual consumers.

A module can provide an independent contract within one library. A separate
package earns its boundary through dependency, target, release, or measured
build requirements. The conceptual layers alone do not require separate packages.

| Domain        | Receives and produces                                                             | Owns                                                                                  |
| ------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| **Messages**  | Conversation values and content parts                                             | Meaning and provenance of text, media references, tool calls, and tool results        |
| **Inference** | A prepared model request becomes streamed output and a terminal result            | Provider capability validation, request execution, continuation material, and usage   |
| **Tools**     | A declared invocation becomes progress and an execution result                    | Definitions, inventory lookup, argument validation, dispatch, and correlated outcomes |
| **History**   | Ordered records become conversation views, branches, and compacted views          | Record ordering, lineage, and the meaning of projections                              |
| **Context**   | Selected history and supplied material become a bounded model input               | Assembly, measurement, transformation, and structural validity                        |
| **Runtime**   | Turn input and supplied strategy become model/tool activity and a settled outcome | The live agent cycle, captured step state, waits, cancellation, and journal barriers  |
| **Sessions**  | Identified submissions and controls become durable queue and run dispositions     | Admission, writer ownership, turn-driver coordination, recovery, and inspection       |

These domains form four levels of responsibility. Messages supplies shared
conversation values. Inference, Tools, History, and Context provide independently
usable mechanisms. Runtime provides live orchestration. Sessions adds optional
durable coordination. Dependencies follow those responsibilities, with several
mechanisms at the same level.

Messages is the smallest shared vocabulary. Inference and Tools use that
vocabulary and own their operation-specific contracts. Inference consumes a
read-only view of tool declarations. History operates on ordered semantic
records of conversation content and accepted outcomes. Context consumes supplied history views and material. Runtime composes
Inference, Tools, History, and Context through their public contracts.

Sessions consumes a **turn-driver contract** for committing input, starting,
steering, cancelling, and observing settlement. A driver can wrap Runtime.
Sessions coordinates that contract without inspecting model requests or tool
arguments. A master supplies the product decisions appropriate to its driver.

The **host** is a composition and authority role. It supplies implementations,
credentials, environments, storage, and process supervision. Provider adapters,
client protocol adapters, and storage implementations sit at their respective
boundaries. Filesystem tools, shell tools, skills discovery, and connector clients
are optional implementations that can be composed into a product.

A **tool host** is the role that actually performs a capability's operation.
It may be the agent's own process, an editor process, or a separate local or
remote service. A client can also be a tool host. These roles can share a
process or span several processes without adding another core layer.
The master selects and composes capabilities. Tool adapters translate calls,
and the tool host validates its resource access and performs the operation.

A host can execute without a terminal or graphical client. Process entrypoints,
transport, and client presentation sit outside these seven components. A server
can retain questions for an external client, while an unattended invocation can
return an input-required disposition. Interaction delivery and waiting policy
are supplied independently of execution authority.

The [ACP client boundary](./acp.md) maps standard exchanges and negotiated
extensions onto these contracts. Wire identifiers, content variants, and version
negotiation remain in that adapter. Durable acceptance and settlement retain
their component meaning independently of a protocol response or display status.

Configuration parsing, storage, field discovery, and editing are host services.
The master defines product setting meanings. Components consume resolved limits,
capabilities, and captured configuration identities through their existing
inputs. A configuration value cannot create provider capability or execution
authority. File-format and field-registry types stay outside the neutral core.

A product tool host can expose the same operations through a direct adapter
and a public protocol adapter. That host owns shared capability definitions,
resource authorization, routing, and result delivery. It can serve another agent
without creating a local agent session. The concrete
[Grida tool-host contract](https://github.com/gridaco/grida/blob/main/packages/grida-ai-agent/docs/tool-host-contract.md)
binds these roles to native and editor execution.

The dependency direction permits all of these uses.

- One Inference request with supplied messages and tool declarations.
- One Tool invocation with a supplied execution capability.
- History projection and Context assembly over data in memory.
- One Runtime turn with an ephemeral journal and a selected strategy.
- Durable Sessions coordinating Runtime through a driver and a persistent journal.

Lower components receive only the identities and capabilities needed by their
operation. Constructing a model request or transforming context requires no
session service, queue, or database.

## Messages, Inference, and Tools

### Messages

Messages defines conversation content and its provenance. It can represent text,
media references, tool-call identity and arguments, and the corresponding result.
A media reference carries the information needed to resolve content under a
stated lifetime and access scope. A tool result preserves its relationship to
the call that produced it.

Readable reasoning, ordinary answer content, and opaque provider state keep
distinct kinds. Optional assistant phase information is preserved when supplied
by an adapter. An answer-phase item alone does not settle a turn.

Request settings, usage accounting, queue state, and execution ownership belong
to their owning domains. A conversation value does not acquire those concerns
merely because it passes between components.

### Inference

Inference executes one prepared request. Its inputs include model selection,
messages, offered tool declarations, output requirements, applicable provider
settings, cancellation, and bounds. Its outputs include incremental content,
completed model items, usage evidence, and an explicit terminal result.

Output retains its semantic kind, including answer content, reasoning, and
provider continuation material. The consumer's projection chooses what is
visible before delivery. Display policy does not change the execution record.

The adapter advertises supported modalities, tool forms, output constraints,
continuation requirements, and measurable usage. An unsupported requirement is
rejected before dispatch. A stream ending before required terminal evidence is
an interrupted attempt. Tool input remains subject to the executor's declared
validation and input protocol before effects.

Provider-specific semantics retain their identity. Signed reasoning material,
cache controls, server-executed tools, or continuation handles use a validated
provider contract with declared scope and lifetime. Opaque provider-owned values
can round-trip without being interpreted by the master. Requests outside the
adapter's declared vocabulary are rejected. Continuation validity is bound to
the originating provider, principal, request shape, history, and declared
capability. An incompatible change requires explicit rebuilding, supported
conversion, or rejection. Native compaction can be an explicit request or an
operation embedded in a response, with replacement state and coverage reported
through the adapter's contract.

Continuation validity and execution authority have separate identities and
lifetimes. A stable continuation binding can survive a host restart when the
provider and account context remain valid. Each new execution still receives
current authorization. Changing the account or losing proof of continuity
requires rebuilding, conversion, or rejection of the retained provider state.

Inference knows the supplied request. It selects neither the product's model
nor its fallback strategy. It reports transport and protocol failures with enough
information for the caller to decide whether another attempt is safe. Automatic
transport behavior must respect the invocation's retry contract. Failure facts
separate transient availability/rate limits, authentication/configuration, quota,
context overflow, refusal, output truncation, and invalid protocol data. Retry
advice includes a provider delay when known. Attempts remain individually
accounted, and the master supplies finite retry and fallback policy.

Once streamed tool calls have admitted effects, an inference retry preserves
those facts and continues from them. A new response's call identifiers cannot
establish that repeating equivalent work is safe.

### Tools

Invalid model arguments or an unavailable tool produce a correlated, bounded
rejection before effects when the call identity is valid. The master can ask for
a corrected call within existing limits. A failure to correlate protocol data
or maintain the journal is a separate execution failure. Denied authority keeps
its own disposition.

Tools separates a **definition**, an **inventory**, and an **executor**. A
definition states the operation, input and output contract, required capabilities,
and relevant execution properties. An inventory resolves a particular version of
a definition. An executor performs an admitted invocation through supplied
capabilities and returns a correlated result.

Each executor receives only the capabilities its operation requires. A text
transform can run with values alone, while a file or command tool receives the
specific environment capability needed for that operation. Filesystem roots,
process launchers, and child-agent creation are separate capabilities.

Required properties include cancellation behavior, output bounds, and recovery
support. Document-specific preconditions and errors follow the tool's schema. A direct invocation is usable independently of a
model. For a model-originated invocation, Runtime binds resolution to the exact
inventory advertised for that inference step.

In-process, remote, and client-executed tools preserve the same call identity
and result semantics. The delivery adapter supplies the appropriate transport.
A local executor can be a proxy to a foreign tool host, so the public execution
contract places no requirement on the implementation language. Acceptance,
completion, cancellation acknowledgment, and confirmed termination retain their
separate meanings across that boundary. A lost reply after an effect requires
reconciliation or an explicit uncertain outcome. Switching clients or editor
bindings cannot retarget that invocation.
The shared input contract uses complete validated arguments. A streaming editor
or multi-stage media executor can expose its own operations and recovery data.
Its protocol owns stage boundaries, partial results, and resumption semantics.
Runtime records the supplied invocation, checkpoints, and outcomes using the
ordinary journal. A shared incremental-input API requires evidence from those
concrete consumers before becoming a core contract.

A result may contain structured evidence, bounded readable content, and
references to fuller artifacts. Omitted content is identified, with an available
retrieval reference when provided by the executor. The tool adapter and master
choose summarization, truncation, and presentation. The execution record retains
evidence required for recovery. Model and client projections apply their access
and presentation policy while preserving the reported outcome's meaning.

## History and Context

History defines ordered semantic records and their projections. It can append
accepted input, completed output, invocation outcomes, and explicit history
operations to an in-memory record sequence. It can derive a conversation view,
identify a branch cut, or apply a compaction boundary. Persistence is supplied
separately.

A fork records its source and cut point. A rewind changes the history visible
to later decisions. A compaction identifies its covered range, provenance,
retained material, and replacement, which may be a readable summary, provider-owned
opaque state, or both. These operations preserve the source facts needed to
account for external effects already performed. Reversing an external effect
requires a separate tool operation.

A durable store records when each turn starts and when it settles. Replaying a
bounded window of history attributes every record to its turn and carries each
turn's outcome and those times. Tool calls and their results remain in the
replayed sequence, so a client can reconstruct chronological activity without
rerunning work. Times recorded before this capability existed are absent, never
estimated.

Context performs pure operations over supplied data. It selects, orders,
measures, trims, and assembles content according to explicit inputs. Its output
carries source positions, relevant provenance, and a measurement or declared
estimate. It validates required tool-call/result relationships and the selected
provider's structural requirements. Synthetic repairs of those relationships are
marked as such and never constitute evidence of an external outcome.

A compaction candidate is validated before replacing the active context view.
Its captured range and lineage must still match, and accepted material outside
that range remains present. Cancellation or failed installation preserves the
previous view. Repeated overflow or ineffective compaction has a finite recovery
policy supplied by the master.

Supplied instructions and skill content retain their source identity, version or
content fingerprint, scope, and trust classification through assembly and
compaction. Human submissions, scheduled or service input, and child output
retain their distinct origin even when encoded using the same provider role.
Transformation cannot promote source content into host authority. Discovery,
precedence, refresh, and missing-source policy belong to the master and host.

Retrieving a remote document or asking a model to summarize history is external
work. The master composes that work through Tools or Inference, with ordinary
cancellation, bounds, and usage accounting, then supplies the resulting data to
Context. The selection policy and summary instructions belong to the master.

Durable history, the current model input, and the client transcript are distinct
views. Execution facts needed for approvals, recovery, or master continuation
remain recoverable outside a prose summary. A lossy image description records
that transformation and retains a source reference where the promised lifetime
requires one.

Context occupancy accounts for messages/media, tool declarations, and provider
framing. Non-message overhead is explicit data bound to the selected inventory
and representation revision. Output headroom is reserved separately. A complete
prepared request is revalidated before dispatch. Only exact counts or valid
upper bounds can certify a hard input ceiling.

Context occupancy, provider usage, and monetary cost have separate meanings.
Cached content can still occupy context. Repeated requests can accumulate usage
without increasing occupancy. Estimates and unavailable measurements remain
explicit in the output.

Usage observations identify the attempt, measurement source, category, unit,
and revision. Adapters normalize updates to cumulative quantities per attempt.
A newer observation replaces the previous one for the same measurement identity, and replay
preserves its identity. Provisional, final, estimated, and unknown values stay
distinguishable. Accounting separates reported consumption from estimates used
for reservations. Another physical attempt has separate usage. Prices, charge
receipts, currency conversion, and display rules come from the host and master.

### Derived conversations

A host can start an independent conversation from a coherent snapshot of
existing history. The seed identifies its source conversation and committed
position, selected material, and any transformation or compaction. It can retain
full selected history or references under the declared retention policy. A
bounded model input is assembled separately when needed. Changes to
the source conversation leave that captured context stable. Refreshing it is
an explicit operation that captures a new position.

Historical material and the new conversation's active instructions retain their
distinct provenance. The master selects which instructions apply and supplies
the new conversation's purpose and role. Provider-owned continuation material
is reused only when its adapter validates the new binding. Otherwise the host
rebuilds supported input, performs an allowed conversion, or rejects the request.

History lineage records where context came from. Execution ownership, control
rights, resource sponsorship, and parent-completion obligations are separately
declared. A conversation derived from another can therefore have an independent
owner and lifecycle. Its result reaches another conversation through an explicit,
identified submission under the master's return policy.

Transcript retention, execution lifetime, tool inventory, and authority are
independent construction choices. Read-only behavior is enforced by the granted
capabilities and executors. Copying context grants no additional execution
authority. Access to referenced material remains subject to current grants and
the referenced resource's availability.

A short-lived transcript can still produce persistent external effects. Its
operation records and receipts retain the lifetime required by the promised
recovery contract, even when the transcript is discarded. Closing observation,
cancelling execution, and discarding retained history use their respective
explicit controls.

## Runtime

Runtime drives one live agent turn using a supplied strategy. It implements the
mechanically valid cycle of preparing an inference request, consuming its output,
resolving tool calls, admitting execution, recording outcomes, and reaching the
next decision point. It can also execute explicitly requested setup or
verification tools with their origin recorded.

The master selects model settings, context, offered tools, scheduling preferences,
and continuation or completion. Runtime provides bounded decision points around
request preparation, tool admission, completed outcomes, waits, and settlement.
These points expose the state needed to decide the next part of an agent turn.
The host/master uses these boundaries for [lifecycle hooks](./hooks.md) and
other product checks. Runtime supplies a pre-invocation gate covering calls
inside a step, plus ordinary scoped operations and recorded results. The host
owns hook event names, matching, ordering, recursion rules, and interpretation.
The exact gate binding remains subject to consumer evidence.

A **step** is one prepared inference request and the tool activity attributed to
its response. A **turn** includes the steps and other admitted work addressing
accepted input. An **effect** is one invocation of external work, including
inference. An **attempt** is one physical execution of that effect. A permitted
retry creates another attempt and retains the effect's prior evidence.

Step attribution does not impose serial execution. A complete, validated tool
call can start while later response items are still streaming, and independent
calls can overlap within declared bounds. Acting on incomplete tool arguments
uses a concrete executor protocol whose guarantees are declared separately.
Before early dispatch, the journal retains the call, validated arguments,
captured definition, and originating inference. A later stream failure preserves
the effects and results of calls already admitted. A failure in one call stops
admission of later calls but does not abandon admitted siblings: they run to a
recorded outcome before the step reports the failure.

Runtime captures the model configuration, offered inventory, context positions,
and authority relevant to each step. Tool activity keeps that snapshot even if
later input or discovery changes the next step. A captured tool definition survives
catalog changes, while current grant revocation can still deny execution. New
instructions are incorporated at a recorded decision boundary. Already performed
effects remain part of the account the master receives.

### The execution journal

The journal records configured checks when the host executes them as managed
operations. Their outputs remain available like other tool or inference results.
The host determines how a check affects subsequent work. Recorded outcomes and
read-only replay retain the ordinary operation guarantees.

Runtime receives an **execution journal** through an explicit contract. The
journal accepts conditional transitions containing operational records, associated
History records, and any master checkpoint needed to continue. Runtime awaits the
required journal barrier before executing dependent external work.

Runtime owns and consumes the journal contract independently of Sessions. The
host's composition supplies its implementation and, for durable execution, binds
it to the same authoritative writer used by Sessions.

An ephemeral journal keeps those records for its declared in-memory lifetime.
A persistent journal supplies the stronger guarantees specified under
[Storage and recovery](#storage-and-recovery). The same Runtime mechanics use
both. The journal is an execution dependency. A progress observer is insufficient
to supply its guarantees.

Only admitted operations and meaningful checkpoints require journal transitions.
Pure calculations inside the master can remain local. Committed history, captured
plans, and outcomes may supply the entire continuation basis. Explicit master
checkpoints retain only additional state needed after interruption. Stable work
identities let a reconstructed master recognize already admitted and completed
operations. A policy version identifies the strategy, while resolved settings
establish what an accepted operation actually meant.

### Ownership and settlement

Runtime has one live owner of its turn state. Independent effects can execute
concurrently while their outcomes enter an ordered record. Admission checks
dependencies, resource constraints, current grants, and remaining bounds.

| Turn phase | Meaning                                                                    | Resulting action                                                           |
| ---------- | -------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Ready      | Accepted input and recorded outcomes are available to the strategy.        | Prepare and admit the next bounded work or choose settlement.              |
| Running    | Admitted effects have active attempts.                                     | Record results and admit further independent or dependent work when valid. |
| Waiting    | Progress requires a named answer, external result, or resumable condition. | Accept the correlated event, resume, or begin settlement.                  |
| Suspended  | A continuation is retained without a live execution owner.                 | Reacquire ownership when the recorded conditions permit continuation.      |
| Settling   | Further work admission is closed.                                          | Cancel or account for owned work and commit the terminal outcome.          |
| Settled    | One terminal outcome accounts for the turn's owned work.                   | Expose that outcome for inspection and later turns.                        |

A wait retains identity, its response contract, and cancellation or expiry
behavior. An interactive tool owns its response schema, including structured
selections or text. Runtime supplies correlation, durable receipt, and cancellation.
The host authorization adapter owns approval payloads and binds any decision to
the exact operation, arguments, scope, and applicable state. Runtime retains the
correlated request and response and requires a valid grant before dispatch.
An ordinary submission remains distinguishable from an interaction response.

Registering an interaction and waiting for its answer are separate operations.
Registration durably records the question and returns its receipt immediately.
The master can continue independent work, observe a later correlated answer, or
wait for it. A tool whose purpose is to ask can finish with that registration
receipt. The answer then enters the master's subsequent decisions as identified
input. A tool whose result requires the answer remains pending until that answer
or another terminal disposition is recorded. The response never retroactively
replaces a completed tool's result.

An interaction outlives any local waiter. Releasing a waiting execution does not
withdraw its question. Withdrawal, expiry, response, and supersession are explicit
recorded transitions. A completed inference releases its capacity while an answer
is outstanding, and an execution need not retain a live model request or an
in-memory continuation to keep the interaction open.

Intentional suspension commits the continuation basis, outstanding interaction
identities, control state, and owned-effect dispositions before releasing the
execution owner. Suspension closes new admission and requires local work to be
quiescent or transferred to an explicitly retained owner. An uncertain effect
retains its reconciliation obligation. Suspension has its own verified receipt
and preserves the logical turn for resumption. Terminal settlement completes it.
Resumption reconstructs the continuation from recorded facts and stable operation
identities under a newly acquired writer epoch.

Suspension checks for input and controls accepted during preparation. An answer
accepted before that check makes the updated state available to the current
owner. An answer accepted after handoff makes the retained turn eligible for
resumption according to policy. The transition cannot lose the wakeup or permit
two execution owners.

Cancellation closes admission, propagates to owned work, and records each
remaining disposition. A remote job that continues after local cancellation
retains its receipt and an explicit owner or recovery obligation. Runtime can
settle when these dispositions are accounted for.

Tool failure, model refusal, and requested stop remain outcome data from which
the master can produce a factual account. Storage or integrity failure suspends
trustworthy continuation and preserves recorded state for recovery.

If a product requires a final generated account, its master schedules that
bounded inference before requesting terminal settlement. A deterministic account
can be projected from recorded facts when generation fails or is interrupted.
The terminal result preserves status, effect dispositions, observations, artifact
references, and unresolved conditions independently of presentation.
Consumer-authored prose is optional additional output. The product master owns
any requirement to publish a user-readable summary for every turn.

## Sessions

Sessions adds durable service behavior around a turn driver. It accepts identified
submissions, retains their ordered disposition, acquires execution ownership,
coordinates start and steering, and observes terminal settlement. Submission
payloads can remain opaque to Sessions. The consumer owns their versioned decoding
contract, while Sessions protects identity, ordering, and retention.

A driver can return a verified suspension receipt as well as a terminal receipt.
Sessions preserves the suspended turn without retaining the driver's live task.
Explicit resumption claims that same logical turn under fresh ownership. Ordinary
observation and reconnection remain read-only.

The driver contract distinguishes **committing input** from **starting execution**.
Acknowledged acceptance means the input is committed even if later preparation
or scheduling fails. Repeated delivery of the same submission identity and content
returns its recorded disposition. Different content under that identity is rejected.

One authoritative writer serializes a session's transitions. Ownership acquisition
excludes or fences the previous writer. A successor loads the authoritative state
under that ownership and reconciles outstanding operations before admitting
conflicting work. A timeout alone establishes neither process termination nor
completion of external work.

The Runtime journal and Sessions admission share this authority and its persistence
transaction boundary. A runtime holds a scoped writer capability for its active
turn. It cannot independently overwrite newer session control state.

### Session driver state

A session can retain one optional, bounded driver-state envelope across turns.
The driver owns its schema and meaning. The envelope identifies its schema
version, state revision, content digest, and encoded value. It uses the same
explicit versioning discipline as a turn checkpoint, while its lifetime spans
the session's successive turns.

Creation can seed this state. Later updates use an expected state revision and a
stable request identity through the existing control or journal transaction.
Conflicting revisions are rejected, and repeating an identical accepted update
returns its original receipt. A turn transition can publish a driver-state update
atomically with its execution records, suspension, or terminal outcome.

Claims and trusted session views expose the captured state and its revision to
the owning driver. A decision that depends on that state declares the revision
as an admission precondition. A newer state update invalidates the stale decision
before dependent effects or continuation can start. Reading state never admits
work. Client adapters expose a separately designed public projection, and raw
credential material remains in host custody.

The state carries application meaning such as a continuing objective or workflow
position. Components enforce identity, size, versioning, and transactional
consistency. Interpretation, completion criteria, and continuation policy belong
to the driver and master. A completed turn and a completed application objective
are separately recorded facts.

### Drivers and controls

A **whole-agent backend adapter** is a separate role from Inference. It can supply
a turn driver for an independently owned engine with its own master. The driver
declares its control, observation, and recovery capabilities. Outer Sessions
retains its own admission and delivery guarantees, but promises internal journal
or recovery guarantees only when the backend actually provides them. A driver
offered as a full implementation of this durable execution contract must satisfy
its journal barriers. An observation-only integration makes no such claim.

Attaching or detaching observation, loading history, resuming execution, closing
a session, and requesting cancellation are distinct operations. Their availability
and effects follow the driver's declared capabilities. A cancellation receipt
does not establish settlement, and restored history does not establish current
activity. Reconnection obtains authoritative execution status before admitting
work that depends on that status.

Queue selection, coalescing, and automatic continuation are master policy. Queue
edits and turn admission use conditional transitions so each accepted input has
one inspectable disposition. A command that both pauses admission and cancels a
turn commits those controls together, and recovery preserves them.

Editing unclaimed queued content creates a new immutable submission identity
that supersedes the previous input at its queue position. Both identities retain
their dispositions. Replacement and claim are mutually exclusive conditional
transitions. After a claim wins, editing reports that outcome and the master
chooses steering or new work. Reordering changes selection order while preserving
input identity. The claimed input and any consulted driver-state revision form
the durable basis of execution. Settings interpretation remains driver policy.

Withdrawal removes an input from eligible work while preserving its recorded
disposition. Its retention and permanent deletion follow the host's separate
data-lifetime policy. Immutable acceptance order and editable queue order have
different meanings.

Pausing an active turn is a persistent continuation blocker. It closes new
admission and requests an orderly suspension while retaining accepted input,
questions, and resumable work. Resume clears that blocker. Other unmet conditions,
such as an unanswered required question, still govern continuation. A stop action
can instead cancel and settle the turn, with subsequent work based on its recorded
partial outcome. The product gives these distinct controls clear meanings.

Admission-closing controls retain their identity and cause after a later Resume.
An observer receiving only the newest state can still distinguish interrupted
work from work admitted after resumption. Resumption does not undo completed
effects or turn an uncertain outcome into a confirmed cancellation.

Recorded outcomes can be projected into conversation history without invoking
their executors. This preserves completed effects when execution stops between
recording a result and publishing the next conversation state. The projection
retains paired call/result identities and excludes incomplete exchanges.

Deriving an independent conversation captures a committed source position and
leaves the source's execution and interactions intact. Copied questions and
approvals are historical content. The new conversation registers any interactions
it needs under its own identities and authority.

Replacing a conversation's active history is an explicit control. It coordinates
affected execution and supersedes affected waits and approvals together,
preserving their records. Restoring historical visibility preserves those
interaction dispositions. Late answers cannot resolve a current wait or grant
current authority. Late effects retain their original step and branch attribution.

Steering identifies its target turn and distinguishes durable receipt from
incorporation into a step. If the target has settled, the retained input receives
that disposition for a subsequent explicit choice. It cannot disappear during
the race with settlement.

### Session lifecycle and deletion

Renaming changes presentation metadata while preserving session identity and
authority. Archival changes visibility under the host's retention policy.
Any accompanying pause, cancellation, or expiry is an explicit control with
its own effect.

Authorized deletion identifies its scope and retention disposition, closes new
admission, and accounts for active work before releasing owned resources.
Owned future wake-ups are cancelled or transferred to an explicit owner.
Outstanding external effects retain any necessary reconciliation obligation
under an identified owner. Cleanup respects other references to shared assets
and the separately declared ownership of exported artifacts.

Deletion fences prior execution and delivery identities. Late results, wake-ups,
and retries cannot recreate the deleted work. A later explicit creation uses
a fresh lifetime identity or generation. The deletion receipt states what was
removed and which obligations or retained records remain under the host's policy.

### Owned child sessions

An owned child has a retained session identity and parent linkage. Each execution
turn has its own turn identity, while accepted work inputs retain separate
identities and dispositions. Steering targets the active turn. Queued work is
bound to the turn that claims it. A completed turn leaves the
child available for further work with its retained context. Display names are
host metadata and may repeat. If the host offers an addressable task alias, it
resolves uniquely within the parent scope to a stable child identity before a
control is admitted. Authority follows the admitted principal and its grants.

Child sessions use the same submission, steering, pause, resume, inspection, and
ownership contracts as other sessions, through explicitly granted control rights.
An informational message has its own delivery receipt. Starting work requires
an explicit follow-up request to the existing child. While the
child is busy, the caller distinguishes steering its active turn from queueing
a subsequent turn. Inspection and waiting for a result remain observational.

An admitted child turn identifies its owner, supplied allocation, and delegated
authority. Parent sponsorship is a product-selected funding relationship.
Reusing a child session rechecks these bindings for the new turn. Steering retains the active turn's bindings
unless an explicit, validated change updates them. It cannot mint another
allowance merely by adding input. Each result identifies the child session,
child turn, and accepted work inputs it actually incorporated. Its committed outcome, delivery
disposition, and parent consumption are separately durable facts. Delivery can
retry without consuming a result twice or attributing an old result to new work.
The master decides which child results satisfy its task and must be consumed
before it requests completion. An idle,
retained child session has settled its assigned work and releases its active
execution slot.

Suspending a parent worker while it awaits independently owned child work allows
that work to continue within its existing grant and allowance. A pause control
names its target turn or owned descendant scope. A tree-scoped control blocks
admission and requests orderly suspension within that scope. Each pause retains
its origin, so removing an ancestor's blocker preserves an independent child
pause. The master chooses which scope a product control requests.
Releasing a child's execution resources settles or suspends its active turn and
preserves retained session history. Permanent deletion has its own explicit
semantics.

Admission enforces the supplied allocation and delegation scope. A child can
spend from an existing allocation or an explicitly authorized separate one.
Creating or reusing a child cannot create funding or authority. Cancellation
propagates through the execution ownership and scope selected for that control.
Detachment requires an explicit new owner and accounting disposition.
Explicitly detached work retains its own owner and visible disposition. A backend's
announcement of a child identity grants observation alone unless it also grants
control. Owned and observed child work retain that distinction, including how
cancellation propagates and which controls the backend can honor.

## Files, workspaces, and scratch

Files is a host capability for reading, inspecting, and mutating identified
resources. Its implementation resolves locations and validates access. Each
concrete file or document tool owns its read/write semantics and any freshness
checks. A filesystem path, a live document binding, and retained artifact content
can have different storage backends and operation contracts.

Access is demand-driven. Opening a workspace requires no complete tree scan.
Directory listings are bounded, and optional indexes or caches identify their
coverage and freshness. A missing index entry cannot revoke otherwise valid
access or make an existing file appear authoritatively absent.

A workspace descriptor identifies an execution context. It has a stable identity,
a revision, and named directory bindings with their own identities and resolved
locations. It may designate a primary directory for default relative-path and
working-directory resolution. A rootless session can have no workspace and still
use attachments and scratch. A product may present a named workspace grouping as
a Project without requiring another neutral execution concept.

Directory membership describes context. Authority comes from separately issued
grants. An additional referenced directory does not automatically become the
working directory or a writable workspace root. Relative paths resolve against
an explicitly selected binding or the captured primary binding. If neither is
available, the operation reports that missing basis instead of guessing a root.
When workspace selection applies, admission records the resolved binding and
workspace revision. A later primary-directory change or membership edit cannot
retarget admitted work.

Scratch is a host-owned working-storage scope with an identity, granted access,
file and byte bounds, and an explicit retention and cleanup policy. It can be
provided independently of a workspace. Separate sessions and child executions
receive their own scopes unless the host explicitly grants shared access to a
particular resource. Scratch access remains subject to the concrete file tool's
validation and native confinement where required.

Retained input, a mutable working copy, and a produced result keep distinct
identities or explicit derivation relationships. A message can carry native media
content or a retained reference. When a tool needs a local file, the host can
materialize a working copy in scratch while preserving its relationship to that
input. The same input can be available to inference in a different representation.
Materialization is admitted against the aggregate input and storage bounds before
bytes are copied. Editing the working copy does not implicitly edit its source.

Scratch cleanup respects active operations, suspended work, and the promised
recovery lifetime of their dependencies. Required content is retained under a
hold or has an explicit rematerialization path from retained input. Releasing a
conversation view or pausing a turn does not release those dependencies by
itself. Recovery reports expired content when neither path remains available.
Cleanup validates scope ownership and follows the host's safe traversal rules.

Publishing a result selects an explicit destination and its current grant.
The publication tool defines its write behavior and returns the result. It can copy content, create a durable retained reference,
or perform an authorized move. The recorded publication result identifies what
was kept and where. Producing or previewing a scratch result does not imply that
it has been saved into a workspace.

The existing components consume these host resource contracts through their
ordinary capability boundaries. Package granularity follows concrete consumers
and dependency requirements.

## Agent state positions

Different positions answer different questions.

| Position         | Meaning                                                                                          |
| ---------------- | ------------------------------------------------------------------------------------------------ |
| Control revision | The version of admission, cancellation, steering, and other state that can invalidate a decision |
| History position | The exact source material captured for a model request or history transformation                 |
| Observer cursor  | The last delivered event or snapshot position for a subscriber                                   |

A decision declares the agent state on which it depends. Admission rejects an
obsolete control decision. Progress delivery and unrelated presentation metadata
do not advance the decision's control revision. A recorded step continues to
identify the history and tool inventory it actually used.

Document state and edit semantics belong to each document implementation. A
concrete tool can define versions, preconditions, or conflict results in its own
schema. Runtime records that invocation and outcome through the ordinary Tool
contract. The tool host routes it to the addressed executor and reports an
unavailable binding when that executor's lifetime ends.

## Storage and recovery

Storage implementations satisfy the Journal and Sessions persistence contracts
through one authoritative commit path. A transition that publishes an effect
outcome together with related History entries and control changes commits them
atomically. History defines the meaning of those entries. Storage supplies their
retention, ordering, and conditional publication.

The persistent profile survives abrupt runtime termination and restart. A host
promising survival across machine power loss supplies a barrier with that stronger
guarantee. Ephemeral execution states its shorter lifetime explicitly.

Commit barriers precede the following dependent operations.

1. Acknowledging accepted input.
2. Dispatching an admitted effect with its resolved inputs and recovery identity.
3. Executing work permitted by an accepted approval or external answer.
4. Using an outcome in a dependent decision.
5. Publishing authoritative terminal settlement.

A storage failure closes the affected admission path at the last acknowledged
revision. Transient output may be batched separately under a declared retention
policy. Observer delivery cannot advance a persistence barrier.

| Effect state        | Recorded fact                                                          | Recovery consequence                                       |
| ------------------- | ---------------------------------------------------------------------- | ---------------------------------------------------------- |
| Prepared            | Invocation inputs, authority, and dispatch obligation were committed.  | Establish whether dispatch occurred before repeating work. |
| Dispatched          | An attempt crossed the executor boundary.                              | Establish the external outcome.                            |
| Waiting externally  | A stable remote receipt or client request is outstanding.              | Query or await the same operation.                         |
| Succeeded or failed | A terminal result and its evidence were committed.                     | Replay the result into views and later decisions.          |
| Outcome unknown     | Terminal evidence is missing and an external effect may have occurred. | Apply the executor's reconciliation contract.              |

An external system may perform work between local journal writes. Even a prepared
record can therefore require reconciliation. Executors declare safe repeatability,
external idempotency support, receipt-based queries, or the need for a human decision
about uncertain work. A newly authorized action retains the unresolved history of
an earlier effect.

A submission stage may complete with remote acceptance while its containing
invocation remains active. Its receipt is committed before separately admitted
polling or retrieval. Recovery uses the captured provider or executor binding
independently of the catalogue for new work. The host can renew access under a compatible principal,
tenant, purpose, endpoint, and billing authority. Records retain the authority
binding and authorized renewal, never secret credentials.

Duplicate delivery of identical terminal evidence is idempotent. Conflicting
results are retained for reconciliation. A valid receipt from an older attempt
can resolve uncertainty, but its sender receives no authority to advance the
current run. The current owner validates and incorporates that evidence.

Recovery reconstructs the continuation basis, captured steps, waits, and effect
receipts. A missing aggregate step outcome is rebuilt from committed inference
and individual tool results without repeating their work. Reading a committed
result requires no provider availability. Another inference or tool execution
is a new attempt subject to admission. Unsupported stored versions fail explicitly,
and indexes or snapshots identify the records from which they were derived.

## Integration capabilities and bounds

[Execution authority](./execution-authority.md) defines the detailed authority
and confinement contract. The host sets the authority ceiling, mandatory denials,
and available grants. The master selects an allowed execution profile and routes
required approval under host policy to a human or delegated automatic reviewer. Review can be
required for a semantically sensitive remote action even when its destination and
operation are already within the granted scope.

The host authorization adapter selects reviewers, interprets their responses,
and obtains or selects host-issued grants. It uses ordinary recorded operations
and correlated interactions for asynchronous work. Runtime rechecks current
authority and controls before dispatch and retains the supplied authorization
evidence. Sessions preserves pending interactions and operation records. The
adapter revalidates restored decisions before they can authorize execution.

A native sandbox adapter enforces the requested profile across process, file,
and network access. If it cannot satisfy that profile, the affected execution is
unavailable. Automatic approval cannot remove confinement, widen host authority,
or override a mandatory denial. The authorization adapter reports denial, review unavailability, or timeout as
appropriate. The executor reports unavailable enforcement. Runtime admits work
only when the required current authority and executor capability are available.

Raw-execution confinement and containment of the trusted host have independent
profiles and availability. The host selects its deployment envelope. A path-based
backend declares its supported alias and resource-identity semantics, and rejects
stronger confidentiality or revocation requirements it cannot enforce.

Artifact persistence publishes retrievable content with stated access and retention.
A durable operation needs durable input references or a declared recovery path
for expired content. Reads continue to honor current grants. Temporary output
states its lifetime.

Effect completion, artifact availability and retention, and presentation have
separate evidence. Failed storage does not erase successful generation. Recovering
the existing result need not generate it again. A presentation receipt establishes
acceptance, while successful display requires observation. A retained descriptor
alone does not establish that its content remains available.

Observer and publication failures are reported separately from the committed
operation result. Delivery retries preserve that result and its identity.

Client adapters apply the host's access rules and the master's content-visibility
policy before public serialization. They project committed facts and transient
progress. Committed facts
are reconstructible from a snapshot and subsequent records. Transient progress
carries attempt identity and can be coalesced. Slow subscribers have bounded buffers
and a resynchronization path. Subscription loss leaves execution under its recorded
owner. Read-only inspection, subscription, and reconnection never start or recover
execution or incur work charges. Cancellation uses the explicit control contract.

Asynchronous delivery and cleanup retain their originating session, attempt, and
client binding lifetime. Delivery and session-identity updates require that binding
to remain current. Cleanup releases only the originating binding's resources.

Each operation declares input, output, concurrency, and lifetime bounds. Admission
accounts for both outstanding reservations and settled consumption, including child
work. Duplicate notifications cannot double-count usage. Hard monetary ceilings
require enforceable upper bounds, and estimated costs remain labeled as estimates.
The master allocates work within the host's admitted limits.

The owner of a transport stream releases acquired streams and resources on
completion, rejected input, cancellation, and error. Declared size limits are
enforced during consumption, including failure responses.

When one allowance funds several turns, the admission basis includes settled
consumption and unresolved reservations from the earlier turns and their funded
children. Starting another turn or acquiring another writer epoch preserves
those liabilities. A host may derive this basis from committed outcomes and
reservations. An unknown external cost remains reserved or explicitly uncertain
until reconciled. Additional funding requires an explicit new allocation.

A scarce concurrency permit covers the operation actively using that resource.
A completed inference releases its inference permit before waiting for tools or
children. Retained usage-budget reservations have a separate lifetime and do not
justify retaining an idle execution slot.

## What can be fixed now

The proposed stable commitments are the seven responsibilities and their dependency
direction, independently usable lower components, captured step identity, explicit
terminal evidence, scoped authority, journal barriers, and single session ownership.
These have concrete conformance tests independent of product taste.

The precise strategy hooks, representation of provider-specific features, packaging,
and public method signatures require multiple consumers to establish their shape.
A useful proof is a direct ephemeral caller and a durable service using the same
Runtime, followed by distinct masters with different context and verification
strategies. Those consumers must be able to differ through the supported contracts.

| Conformance case                                                    | Required observation                                                                                          |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Call Inference directly.                                            | A validated request yields output and terminal evidence without a session service.                            |
| Invoke a Tool directly.                                             | Validation, capability scope, bounds, and result correlation remain enforced.                                 |
| Project History and assemble Context over supplied data.            | The result is deterministic for those inputs and declared pure transforms.                                    |
| Compact instructions or external-source input.                      | Source identity, scope, trust classification, and origin remain distinguishable.                              |
| Read an existing file outside an index's scanned coverage.          | The direct scoped read works, while index results report their incomplete coverage.                           |
| Dispatch a complete tool call before the model stream fails.        | The call and its real effects remain recorded under the originating inference.                                |
| Derive a conversation while its source continues changing.          | The seed retains its captured position, with independently declared ownership and controls.                   |
| Reuse derived context with an incompatible provider binding.        | The adapter rebuilds, converts, or rejects the input according to its declared capabilities.                  |
| Discard a temporary conversation after an external action.          | Required operation evidence survives according to the effect's recovery and retention contract.               |
| Edit an uploaded image in a rootless session.                       | The input and working copy retain their relationship, and the result is available without workspace mutation. |
| Change the primary directory while a file operation is admitted.    | The operation retains its captured directory identity and supplied arguments.                                 |
| Pause work while scratch cleanup becomes eligible.                  | Required bytes remain held or rematerializable for the promised recovery lifetime.                            |
| Run a turn with an ephemeral journal.                               | The live cycle, waits, and cancellation work within the stated lifetime.                                      |
| Run that turn with persistent Sessions.                             | Input acceptance and pre-effect barriers survive the declared failure model.                                  |
| Change presentation metadata while preparing a step.                | Relevant control and history checks remain independent of that metadata.                                      |
| Stop races with queued admission.                                   | One ordered control transition determines which work was admitted.                                            |
| Pause and Resume arrive before an observer sees either update.      | Earlier work retains its interruption cause. Later admitted work is unaffected by the old pause.              |
| Stop follows a recorded tool result before transcript publication.  | Later context includes the recorded effect without repeating its executor.                                    |
| A question is posted while independent work remains.                | Registration returns immediately, and the correlated answer can inform a subsequent decision.                 |
| A waiting execution suspends and its worker exits.                  | The pending question and continuation survive without a live inference request or waiter.                     |
| An answer arrives while suspension is committing.                   | It reaches the current owner or makes the suspended turn eligible for one resumption.                         |
| Resume is requested while a required answer is still missing.       | The pause blocker clears while the unanswered interaction retains its own disposition.                        |
| Storage fails before recording an outcome.                          | Dependent execution stops at the last committed state.                                                        |
| An old attempt returns a valid receipt.                             | The current owner can reconcile it without reviving the old writer.                                           |
| Parent and child write the same resource.                           | Both callers use the document tool's own contract and receive its reported outcomes.                          |
| A staged executor reports interruption after partial work.          | Retain its checkpoint and reported outcome. Recovery follows that executor's declared contract.               |
| Continuation becomes incompatible after compaction.                 | The adapter explicitly rebuilds, converts, or rejects it. Synthetic repair preserves its provenance.          |
| Reattach to an independently owned agent backend.                   | History, current activity, cancellation receipt, and observed settlement remain distinguishable.              |
| Retry a child result while the parent awaits it.                    | Durable delivery yields one parent consumption.                                                               |
| Two children have the same display name.                            | Controls resolve a stable child identity or an unambiguous parent-scoped alias before admission.              |
| Submit more work after a child turn completes.                      | The same child session receives a new turn with current sponsorship, authority, and allowance.                |
| Steer a child whose turn is still running.                          | The new input targets that turn and retains its sponsorship and allowance unless explicitly changed.          |
| An earlier child result arrives after a follow-up starts.           | Its session and turn identity preserve the original delivery and consumption target.                          |
| A parent worker suspends while its child runs.                      | The independently owned child continues within its recorded grant and allowance.                              |
| Resume a parent whose child was independently paused.               | The child's own pause remains effective.                                                                      |
| A child delegates again while the parent is stopping.               | Descendant admission and cancellation honor the same owned-tree bounds and control state.                     |
| A result or wake-up arrives after its session was deleted.          | The prior lifetime is fenced, shared assets remain correctly owned, and deleted work is not recreated.        |
| Driver state changes after a continuation was selected.             | Admission rejects the stale state revision before dependent work starts.                                      |
| A terminal turn also changes continuing driver state.               | One commit publishes both transitions, and retry returns the same receipt.                                    |
| Another turn starts while earlier funded work has unknown cost.     | Its allowance still accounts for the outstanding reservation and child liabilities.                           |
| A cumulative usage update is repeated before the final report.      | The newest attempt-scoped observation replaces the earlier value, and replay adds no consumption.             |
| A queued input is edited while execution claims it.                 | Exactly one conditional transition wins, with the selected content and superseded input still attributable.   |
| A source conversation is forked while awaiting an answer.           | The source wait stays active, and its copied representation grants no interaction authority to the fork.      |
| A tool needs an inference permit after its parent request finishes. | The completed request releases its permit so dependent work can proceed.                                      |
| Restart after per-effect results but before aggregate publication.  | The step and continuation basis are reconstructed without repeating completed work.                           |
| Rewind past an outstanding interactive wait or approval.            | The wait is superseded, and late answers or results retain their original attribution.                        |
| Rebind a path while an admitted live-resource mutation is pending.  | The host preserves the addressed executor and supplied arguments. A missing binding is unavailable.           |
| Recover a recorded remote job after catalogue retirement.           | Compatible authority resumes the same job. Artifact retention failure does not imply new generation.          |
| Automatic review approves an action outside host authority.         | Mandatory denials and the required confinement still prevent execution.                                       |
| Resume a pending review after a policy change or revocation.        | The retained verdict is revalidated, and stale approval cannot authorize dispatch.                            |
| Replace a master's context or verification strategy.                | Lower component contracts continue to apply.                                                                  |
