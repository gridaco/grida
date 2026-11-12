---
title: Agent Master
description: The product harness that turns reusable agent components into intentional behavior, controls task performance, and fulfills the user experience contract.
keywords: [agent, harness, master, product design, context, evaluation]
format: md
sidebar_position: 2
tags: [internal, wg, ai, architecture]
---

# Agent Master

This proposal defines the **master**, the thin product layer that decides how
an agent works toward a user's goal. It is written for people designing an
agent product. The [experience contract](./experience.md) defines the promises
the master must fulfill. The [components contract](./components.md) defines
the machinery available to it.

The master is where product design becomes executable judgment. Choosing what
the model sees, when to inspect an artifact, how much effort to spend, when to
ask a question, and what counts as finished all belong here. These choices
determine whether the product is a capable design assistant, a careful coding
assistant, or something else.

Thinness means the master expresses decisions using reusable components. Its
size comes from product policy. Execution bookkeeping belongs to the component
that can enforce it consistently.

## Responsibility and authority

| Concern      | Master owns                                                                   | Component or host owns                                                           |
| ------------ | ----------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Intent       | Interpretation of the request, constraints, and success criteria              | Preservation of accepted input and its order                                     |
| Model        | Selection for a particular purpose and allowed fallback choices               | Capability validation, protocol execution, and usage receipts                    |
| Context      | Relevance, instructions, retrieval, retained observations, and summary policy | Bounded assembly, provenance, and valid provider representation                  |
| Tools        | Names, descriptions, offered operations, and when they help                   | Argument validation, invocation identity, granted access, and outcome accounting |
| Work         | Planning, delegation, review, priority, and desired concurrency               | Ownership, dependency enforcement, cancellation, and resource limits             |
| Memory       | What should be remembered and when it should be recalled                      | Storage, retrieval, provenance, and retention enforcement                        |
| Effort       | Allocation among exploration, production, verification, and reporting         | Reservation, metering, and enforcement of admitted limits                        |
| Completion   | Whether evidence satisfies the user's request                                 | Durable recording of completion and unresolved work                              |
| Presentation | Progress wording, questions, result organization, and final summary           | Delivery, reconnection, and consistent views of recorded facts                   |

The host supplies authority over files, services, credentials, and execution
environments. A tool host may implement an operation in another language or
process, including a live editor. The master selects the workflow and evaluates
its results. The adapter and host own transport and authorization. Each document
implementation owns its editing and state. The master's choices operate within that authority. A request to
increase effort changes the work allocation. An increase in access follows
the host's authorization procedure.

The permission profile, approval policy, and reviewer are distinct selections.
The profile defines available execution authority. The approval policy decides
which eligible actions require another decision. The reviewer is a person or
a separately configured automatic reviewer. Product presets can combine these
selections while preserving their individual meanings.

New Desktop chats default to asking the user before granting additional access.
Previously granted scope remains subject to its existing constraints. Automatic
review requires an explicit selection and its own eligibility policy.

An automatic-review mode delegates eligible decisions within host policy. The
master supplies review policy, reviewer selection, evidence preparation, resource
allowance, and fallback behavior. Host-mandated denials and human decisions remain
effective. The host authorization adapter owns the review lifecycle and validates
the decision against the exact action. Runtime enforces the resulting grant and
current controls before dispatch. Review timeout, denial, and unavailable
reviewer remain distinguishable outcomes.

Plan/Act and Standard/Ultra remain separate from these permission selections.
Planning constrains the allowed work, effort constrains allocation, and approval
routing chooses who decides an eligible permission request.

The word master names this product responsibility. It introduces no requirement
for a supervising model or an additional model call. A master can combine fixed
rules, data, and model-assisted decisions.

Selecting a model provider keeps strategy in this master and execution in its
Runtime. A product may also delegate work to a whole-agent backend that owns
its own strategy and execution. That adapter declares which controls, outcomes,
and recovery guarantees it exposes. The outer master owns delegation and
evaluation, while the delegated agent owns its internal choices within the
agreed scope. Product promises follow that actual division of responsibility.

The [ACP boundary](./acp.md) carries the native agent's public exchanges. It
leaves strategy in this master and visual presentation in the client. Optional
view hints never decide permission or completion. A client that supports fewer
controls receives an explicit supported profile and useful standard content.

## The decision model

A master supplies strategy at Runtime's bounded decision points. It prepares
model requests, selects context and offered tools, judges outcomes, chooses
continuation, and requests settlement. Runtime owns the live agent cycle and
validates work admission. Sessions separately owns durable input acceptance,
queue control, and service ownership through its turn-driver contract.

The master receives the relevant recorded state, available capabilities,
remaining resource allowances, and newly incorporated input. A decision names
its purpose, requested work, limits, and supporting evidence. It identifies the
control revision, history position, and selected tool inventory on which it
depends. Admission checks the agent control state. An obsolete control decision
requires reconsideration. Progress delivery and unrelated presentation changes
do not invalidate a decision.

The product can also compose lower components directly. A single Inference
request, a Tool invocation, or a pure Context transformation has its own
contract. These uses require no universal next-action language. Within a managed
turn, external work passes through Runtime's admission and journal barriers so
that its effects remain owned and recoverable.

A simple task can finish after one inference. A visual task can alternate
creation and inspection. A complex task can have several independent
investigations and one final integration step. A step is one prepared inference
request and the tool activity attributed to its response. Setup or verification
work can also be attributed directly to the turn.

The following boundaries describe product decisions that the components must
support. Exact strategy hooks and public signatures require evidence from
distinct consumers.

| Decision boundary         | Questions the master resolves                                                                     |
| ------------------------- | ------------------------------------------------------------------------------------------------- |
| Input accepted            | What is the goal, what constrains it, and what evidence would establish success?                  |
| Work selected             | What should happen next, and which independent work is worth doing concurrently?                  |
| Inference prepared        | Which model, instructions, context, tools, and output requirements serve this step?               |
| Outcome received          | What did this establish, what remains uncertain, and which assumptions changed?                   |
| Human response received   | Which exact pending decision did the response resolve, and how does work continue?                |
| Resource pressure reached | What can be reduced, deferred, summarized, or completed within the remaining allowance?           |
| Recovery required         | Which recorded work is complete, which work can resume, and which effects require reconciliation? |
| Completion considered     | Do observed results satisfy the request, and can the final account explain any limits?            |

Reading a file, retrieving context from a service, and asking a model to score
an output are observable operations. The master requests them through the same
owned execution machinery as other work. This keeps time, cost, cancellation,
and recovery accountable even during planning.

Observation has a separate role. A progress observer or metrics collector can
consume recorded facts. Any response that changes future work must enter
through a decision boundary with the appropriate authority.

## Product state survives continuation

The master maintains the user's goal, accepted constraints, outstanding work,
chosen effort, active operating regime, and the evidence supporting its
decisions. These facts must survive a client reconnect and an execution restart.

Each admitted operation retains the policy revision and the resolved inputs
needed to interpret it. This includes the selected model capability contract,
tool definitions, instruction versions, context references, resource limits,
and product state changes relevant to that work. Mutable resources need a
captured version or a recorded observation. A policy version is a useful
identifier, while the recorded operation establishes what actually ran.

Runtime's journal records admitted effects and meaningful master checkpoints
before dependent execution. Those checkpoints preserve enough product state
to continue or reconcile the work after interruption. Pure internal calculations
need no separate journal entry. Sessions and the persistent journal share one
authoritative commit path in a durable composition.

A simple master can reconstruct its next decision from committed history,
captured plans, and outcomes. Explicit checkpoints preserve additional product
state that those records cannot reconstruct. Restart restores that continuation
basis and reconciles existing work before selecting a new operation.

Following a restart, the master receives the recorded outcome and unresolved
operations. It can continue from that state using a supported policy revision.
An unavailable policy or capability produces a visible waiting or failure
state with a recovery action. Adopting a changed policy is an explicit
transition applied to future work.

## Designing the agent's behavior

### Intent and initiative

The master carries forward the original goal while incorporating corrections.
It distinguishes a question about ongoing work from a replacement task. It
asks for missing information when different answers would materially change
the result or authorization. Ordinary implementation choices can be resolved
from the request and observed context.

Questions are specific and answerable. The master records why an answer is
needed and which work is waiting for it. Independent authorized work may
continue while that answer is pending.

Slash commands and explicit skill selections are product input affordances.
The composer resolves a command to a known action or supplied prompt, and resolves
a skill reference to an available identity before submission. Controls use the
same authority and history rules as buttons. Skill selection records the user's
intent and applies the normal scoped loading policy.

### Persistent goal discipline

A goal is product-owned objective state and a continuation policy spanning work
turns. The master exposes tools to create, inspect, revise, and report progress
against it. The product defines completion evidence, blocked-work policy,
continuation limits, and which controls require an explicit user request.
Starting a goal is an explicit action.

The goal record carries its identity, revision, objective, progress, status, and
applicable resource allowance. Session driver state retains that record across
turns, while individual operations and turns retain their own execution facts.
Plan/Act, agent effort, and permissions remain independently selected policies.

After a work turn settles, the harness decides whether the goal is complete,
another turn is useful, or it should wait for input or an event. Continuation
uses the ordinary submission and claim path with a stable input identity and
the goal revision on which the decision depends. Generated continuation input
retains its origin and conveys no new user authorization. Repeated notifications
or restart recovery cannot create duplicate goal work.

A goal edit, pause, clear, completion, or exhausted allowance prevents stale
continuation from being admitted. Updates that change ongoing work combine the
new driver state with the applicable task control. Claim and effect admission
recheck the state revision. A completion account and the goal-state transition
it asserts commit together.

Goal usage includes work across prior turns and children, including outstanding
reservations and late-reported costs. Ending a turn or reopening its session
does not refresh that allowance. The master determines useful next work and
proves completion. The components preserve state, ordering, limits, and evidence.

Routine progress and usage observations remain in the execution record. The
master updates its goal summary at decision boundaries so display updates do
not continually invalidate active decisions. Copying goal context into a branch
does not itself authorize automatic continuation in that branch.

### Shared product capabilities

The master selects Grida operations from a shared capability catalog. A direct
binding and an MCP binding share their operation definitions, resource grants,
executors, and results. The master adds domain instructions, context,
workflow, and verification. External agents choose their own strategy over the
same granted capabilities.

Editor context, document operations, rendering/media, and optional presentation
have distinct requirements. A context snapshot follows its owning tool's schema
and preserves its source. Grida aims to represent documents as text IR, with
each document implementation owning its interpretation, edits, persistence, and
any conflict behavior. The master uses those tools and their reported outcomes.
Discovery describes operations independently of the current selection. Optional presentation can return its declared
non-interactive disposition. Missing essential execution capabilities remain
explicit. The [tool-host contract](https://github.com/gridaco/grida/blob/main/packages/grida-ai-agent/docs/tool-host-contract.md)
defines the concrete bindings.

### Failures, retries, and fallback

The master chooses finite retry counts, total retry time, backoff policy, and
allowed model/provider fallbacks. It uses typed failure evidence from the
adapter and honors provider delay advice within the remaining allowance.
Authentication, quota, configuration, refusal, and context-limit outcomes have
different recovery paths. User-visible waiting and exhaustion explain what
happens next. Stop and Pause remain effective during backoff.

A fallback respects the person's explicit provider/model choice and existing
authority. Completed attempts and known usage remain accounted even when a
later attempt succeeds. Once tool effects have started during streaming,
continuation uses their recorded outcomes. Reissuing the original prompt with
fresh call identifiers cannot establish safe repetition.

Invalid tool arguments or an unavailable tool can produce bounded feedback for
a corrected call. Repeated corrections consume the same task limits. Host or
journal failure requires recovery, and a permission denial retains its authority
meaning.

### Context and tool design

The master decides which facts deserve scarce model attention. It chooses the
instruction hierarchy, relevant history, retrieved material, visual
observations, tool descriptions, and output constraints for each step.
Untrusted content retains its provenance through assembly and summarization.

Instruction and skill discovery, precedence, refresh boundaries, and missing-source
behavior are explicit product policy. Each prepared request captures the content
it uses, or a durable reference that can recover that content, together with its
source, version, scope, and trust. Recovery preserves that evidence. A subsequent
decision may deliberately refresh its inputs and record the change. Failure to
load a required source produces a visible unavailable state or the declared
fallback. The resulting context records that disposition.

Visual work requires visual evidence when appearance is part of success. A
successful edit operation establishes that an edit occurred. The master
selects an inspection capable of establishing the requested appearance and
uses its result to decide whether further work is needed.

The master also decides when an intermediate artifact is useful enough to
present while work continues. It can expose the first meaningful renderable
result, then refine it. Presentation-request acceptance, actual visible output,
and artifact persistence provide different evidence for that decision.

The master selects the public transcript, including reasoning visibility and
progress wording. Host adapters apply that selection and access rules before
serialization. Preview gestures, image export, and Library search refinement
belong to client or tool adapters. They use artifact references and correlated
interactions without adding those product concepts to Runtime.

Tools express operations the model can understand and use reliably. Their
presentation can change by task and step. The master selects the offered set
before inference, and execution uses the same captured definitions. A newly
discovered tool becomes available through a subsequent admitted decision.

The master chooses whether a task benefits from complete-input tools or tools
that can consume input incrementally. Incremental execution can reduce the delay
before useful work appears. The tool's contract determines whether intermediate
work is a preview, a staged change, or an applied effect. The master selects
that behavior within the granted authority and accounts for partial results
when input is interrupted.

Context transforms are chosen for a purpose and evaluated for what they lose.
Summaries preserve current goals, constraints, unresolved operations, artifact
references, and evidence needed for continuation. The master can retrieve
original material when a later decision needs more detail.

Provider-native compaction is another available transformation. Its replacement
context can contain opaque provider state alongside readable material. The
master selects a compatible transformation and retains the facts needed to
continue the task independently of its display summary.

Context budgeting includes tool declarations, media, and provider framing in
addition to conversation text. Output headroom has a separate reservation.
Estimated occupancy is presented as estimated. A hard ceiling requires a
validated bound over the complete request.

Compaction first produces a candidate for a captured history range. Installation
checks that range and preserves later input, current instructions, and operation
evidence. Failure retains the previous view. When compaction cannot make enough
room, the master stops after bounded recovery attempts and explains the limit.
Foreground compaction is sufficient initially. Speculative background preparation
can be added when measured latency justifies its extra coordination.

### Files, workspace, and scratch

The product can group related directories into a Project with a primary
directory. The host resolves that selection into a versioned workspace view.
The master chooses working directories, instruction discovery, and tool targets
within the granted roots. Each operation captures its actual target so a later
primary-directory change cannot redirect already admitted work.

Attachments can provide native model content and a separate working-file
representation. The master requests materialization when a file-oriented tool
needs it. Newly generated files and intermediate work use the session's scratch
scope unless the task selects another destination. Editing an existing authored
file retains that explicitly requested target.

Accepted input retains the identities of supplied items, the representations
actually included, and any omitted or unusable material. The master explains
those dispositions before relying on a reduced input. Capability validation
reports what is usable, while the master chooses conversion, omission, another
provider, or a request for replacement material. Image perception and original-file
editing can have different availability.

For an uploaded PNG, the master can stage a working copy, apply the requested
text, inspect the result, and publish an accessible artifact without changing
project files. Saving the result into a project is a separate selected operation.
The host retains original bytes or a valid rematerialization source for promised
recovery and delays cleanup while active work depends on scratch content.

### Agent effort and operating regime

The product setting is **Agent effort**, with **Standard** and **Ultra** presets.
Standard uses a task-proportionate allocation. Ultra permits a larger allocation for useful
exploration, alternative solutions, independent review, and verification.
Both use the same execution contracts.

Ultra also selects proactive delegation. The master identifies independently
useful work and initiates bounded child tasks when concurrent investigation,
implementation, or review can improve the outcome. It continues useful work
while they run and integrates their results. The user need not request each
subagent. Standard may delegate too, and neither mode imposes a fixed child count.
Model reasoning effort remains a separate per-request choice. A higher reasoning
setting alone does not fulfill the Ultra behavior.

An agent effort selection resolves into a concrete allowance before work starts.
The product makes the applicable limits and material cost or duration tradeoffs
available to the user. The master reserves room for verification and reporting,
accounts for child work within the parent allowance, and explains a constrained
outcome when the allowance is exhausted. A changed agent effort selection is recorded
with the point from which it applies.

**Plan** and **Act** describe the operating regime. Plan permits investigation
and production of the plan artifact under a narrow grant. Act permits carrying
out the request under the user's grants. Effort and regime are independent.
Ultra can therefore produce a more thoroughly investigated plan while retaining
Plan's authority boundary. The user authorizes the transition that permits
execution of the plan.

The selected model is a separate choice. When a selected model cannot satisfy
a required capability, the master explains the limitation and offers a
supported route. Any automatic fallback must be covered by the user's prior
selection and remain within its access and spending limits.

### Configuration and self-inspection

The master owns the reviewed meanings, defaults, validation rules, and
descriptions of product settings. Host configuration supplies resolved values
with their sources and revisions. The agent can inspect and explain that
configuration through a bounded tool, including which settings affected earlier
accepted work.

A requested persistent change uses the same typed host update operation as
other clients. The master resolves the intended scope, reports the actual
result, and explains when it applies. It changes persistent defaults only when
the person requests that scope. Reset removes an override and exposes the
inherited default. Host authority and provider capability limits remain separate
from configurable preferences.

Configuration changes follow the captured-input rule. New defaults apply to
later accepted requests. An explicit change to current work uses its control
boundary. Field names and file formats belong to the concrete host design.

### Lifecycle hooks

The master selects the [configured hooks](./hooks.md) that apply to accepted
work and defines which events may contribute context, reject an action, or
request more verification. The host owns discovery, executable trust, and
execution scope, event dispatch, handler order, recursion rules, and result
interpretation. Components supply a pre-invocation gate, ordinary managed work,
durable results, bounds, and cancellation through the existing execution contract.

Required check failure blocks its governed action. Observational failures add
diagnostics while preserving recorded outcomes. A completion hook's request for
more work is subject to current controls and the same remaining allowance.
Explicit Stop and Pause remain authoritative. Model-attempt metrics and
ordinary subscriptions have no power to extend a task.

### Usage and cost presentation

The master separates context occupancy, accumulated usage, estimated cost,
reported charges, and remaining allowances. The host supplies prices and any
authoritative charge source. Missing prices or unsettled charges remain unknown.
Display refreshes use recorded measurements and cannot trigger more paid work.

Streaming and terminal usage observations describe the same attempts. Their
replacement rules prevent repeated observations from inflating consumption.
The master chooses visible estimates, reporting detail, and funding policy.
Components enforce the supplied limits and preserve outstanding liabilities
across retries, children, and later turns.

### Side conversations

The master can initialize a separate conversation from a captured context view.
It selects authorized source material, the source position, any transformation,
the new instructions and model, tools and grants, retention, owner, allowance,
and result-delivery policy. The initial context can reuse an already compacted
view. A fresh summary is an explicit transformation with its own cost.

The side-conversation policy identifies the role to the model and separates
inherited reference material from active instructions. The initial product
discipline follows focused questions and lightweight non-mutating exploration.
Further effects require a new explicit request and the applicable authority.
The master withholds delegation and scheduled work from the side conversation
when following that discipline.

Lineage records where the context came from. The side chat has its own execution
ownership and does not become required child work solely through that lineage.
Its controls and allowance are selected independently. The main task continues,
and side output enters it only through explicit, attributable forwarding.

A strict read-only instance is created with read-only capabilities and grants.
An action-capable instance receives the relevant scoped executors and authority.
The same conversation mechanisms serve either policy. Instructions express the
role, while capability enforcement establishes the effect boundary. Temporary
transcript retention is independent of required effect-record retention.

### Delegation and verification

The master delegates work when the task contains an independently useful
question or deliverable. A child receives a bounded objective, the relevant
context, an allowance, and authority derived from the parent's grants.
The parent remains responsible for reconciling contradictory findings and
integrating outputs into the user's requested result.

The master can create a named child or assign further work to an existing child
session. It retains a roster of stable identities, readable labels, assignments,
and observed status. A parent-scoped task alias, where offered, resolves uniquely
to that identity before sending a control. Renaming a display label changes no
execution or authority binding.

Sending information and assigning work have distinct wake behavior. Information
can join an active child's next decision or remain pending while it is idle.
A follow-up assignment starts another turn when the child is idle. For busy
children, the master explicitly chooses steering of the current turn or queueing
another turn. Received, incorporated, and completed remain distinct outcomes.

Each accepted assignment has its own input identity and identifies the child
turn it starts or updates. A new child turn records its sponsoring parent turn,
scope, and allowance. Steering keeps the active turn's existing sponsorship and
limits unless an explicit change is validated. The parent checks both the
completed child turn and the inputs its result accounts for. A retained idle
child conversation can outlive that obligation.

The master can inspect, pause, resume, stop, and close the children it controls.
Waiting or suspending its own worker while a child runs preserves that child's
work. An explicit parent Pause applies throughout the owned tree, while a
child-specific Pause applies to that subtree. Independent child pauses remain
effective when an ancestor resumes. Close first accounts for active work and
releases execution resources under the declared history-retention policy.

The allowance covers the owned descendant tree. A child cannot obtain a fresh
unaccounted budget by delegating again. Stop closes admission throughout that
tree before cancellation is propagated. Work that continues independently needs
an explicit ownership transfer and its own applicable authority and allowance.

The master chooses concurrent work according to task dependencies and the
capabilities offered by its tools. Separate investigations can proceed together.
Document tools own their edit behavior for every caller, including parent and
child agents. The master responds to their reported outcomes through ordinary
follow-up decisions.

Verification is selected from the success criteria. Examples include inspecting
a rendered artifact, reopening a saved file, checking a calculation, exercising
an interaction, or running a relevant automated check. The master records what
was checked and the result. A failed check feeds another decision or an honest
partial outcome.

Helper inference also has an explicit owner, allowance, and cancellation policy.
Compaction, automatic review, and optional title generation use the same inference
accounting as task work. Optional session housekeeping can have a session-owned
lifetime so it does not delay a completed task's final account. It cannot become
untracked work merely because its output is absent from the conversation.

### Input during work and stopping

Ordinary additional requests enter the visible queue. Explicit steering enters
the active turn at a recorded decision boundary. The master reevaluates pending
work against the accepted correction and the effects already performed.

For this product, accepting a request captures its requested model, agent
effort, operating regime, and approval policy. Unspecified values resolve from
the committed defaults at acceptance. Queued work displays that configuration.
Editing a queued request can explicitly replace its captured choices. Changing
defaults affects later submissions. Current grant revocation, host ceilings,
and remaining allowances still apply when work starts.

This preserves the meaning of the request the person submitted. An unavailable
captured choice produces a visible resolution under its recorded fallback
policy. Sessions treats the captured configuration as opaque input data.

An edit replaces an unclaimed queued input while retaining its position and
supersession history. If execution has already claimed it, the product offers
steering or a new request. Failed acceptance preserves the unsent draft. The
components enforce identity and ordering, while the master owns these choices
and their presentation.

Headless execution uses the same master with explicitly supplied capabilities
and interaction policy. A server can deliver questions to another client. An
unattended invocation makes permitted assumptions or returns an identified
input-required outcome when a decision is essential. It preserves a resumable
wait instead of silently granting permission or waiting indefinitely for terminal
input. Approval policy and confinement remain independently selected.

For human input, the master chooses whether the question blocks dependent work
or permits independent work to continue. Registration creates a durable question
and returns its receipt immediately. A nonblocking question tool reports that
registration as its result. The answer later arrives as a correlated control
and is incorporated into the task at a recorded decision boundary. An
answer-dependent tool can instead retain a pending invocation until the answer
is available. Its response contract has the same durable identity.

When there is no useful work to do, the master can intentionally suspend the
unfinished turn. Runtime records its continuation basis and accounts for active
effects before Sessions verifies the suspension and releases the worker. A
resume acquires a new lease for that same logical turn. Human think time requires
neither an open model request nor a retained worker future.
Suspension retains the unfinished task's place and does not advance its queue.

Pause requests this suspension and also blocks new task work and automatic queue
advancement. Resume clears the user pause. Other conditions, including missing
answers and unresolved effects, still govern whether work can proceed. The
remaining allowance and operation identities survive suspension.

A rapid Pause followed by Resume still preserves why an in-flight response was
interrupted. The master uses that recorded cause when choosing continuation.
Uncertain tool effects keep their reconciliation requirement after resumption.

The proposed product's Stop action cancels active work and pauses automatic
queue advancement. Queued requests remain visible for editing, removal, or
explicit resumption. The pause and cancellation request are committed together
before another queued turn can be admitted. The pause survives a restart and
is cleared only by an explicit resumption. A pending permission request retains
its own identity.
Ordinary conversation cannot resolve it implicitly.

Stop ends the current turn with its recorded partial outcome. Continuing that
task is a new turn. A paused turn remains unfinished and resumes under its
existing identity. The product distinguishes resuming the task from resuming
automatic queue advancement.

Before settling a stopped turn, the master publishes already recorded effects
into the conversation context. A later turn can account for those effects even
when stopping interrupted the earlier transcript publication.

After failure, the master selects recovery using the operation's recorded
classification. Safe resumption and retries consume the remaining allowance.
An uncertain external effect is reconciled before a repeat is admitted. A
missing human response produces a clear waiting state.

### Scheduled wake-ups

The master can request a timed wake-up with a task identity and continuation
purpose. The host owns its durable timer and delivery identity. Delivery wakes
the existing task through normal admission and suspension rules. Duplicate
delivery preserves the same event identity, and user pause, cancellation,
authority, and resource limits still apply. The master decides whether the
result warrants a user notification.

### Branching and editing history

The product can create a separate conversation from a captured history point.
The source continues under its existing controls, including pending questions.
The master declares the new conversation's permissions and retained references.
Shared workspace files keep their existing state, and copied context conveys
no additional access or permission to answer the source's interactions.

Editing earlier input changes a conversation's active history. The revised
message is new accepted input after a selected cut, with original later history
still inspectable. The master shows the affected range and settles or suspends
affected work before applying the change. Its obsolete questions and approvals
are superseded, including when their historical text becomes visible again.

Provider continuation state is reused only when compatible with the selected
history. External effects retain their original records, and reversing them
requires separate authorized work.

### Final account

Every terminal turn has a user-readable account of its outcome. The master
selects the detail appropriate to the request and includes the result, relevant
artifacts, checks actually performed, and unresolved work or limits.

The final account derives from recorded outcomes and observations. A successful
tool call alone cannot establish the quality of the whole task. A polished
summary cannot change a failed or interrupted execution status.

Reporting has a bounded allowance. If model-generated reporting fails, the
product produces a concise account from recorded facts and makes partial work
accessible. Recovering or regenerating the account refers to the same turn and
its existing effects.

The master prepares this account after task effects and required child work
have settled, while the turn still admits its reserved reporting work. Any
reporting inference is recorded and metered like other inference. At this
point the master admits only reporting work while the proposed completion
remains current. The proposal identifies the control state and recorded outcomes
on which the account depends. A correction incorporated before settlement
invalidates the proposal and returns the master to the appropriate decision
point. A correction ordered after settlement retains an explicit disposition
for subsequent work.

The master submits the account and task outcome for terminal settlement
together, conditional on that proposal remaining current. Reporting failure or a user
stop selects the factual fallback, so publishing the terminal outcome always
has an available summary. A later rendering of that account is a view of
settled facts.

### Turn activity presentation

The master decides how recorded work is described to the person. It classifies
each tool into an activity kind, such as reading, searching, editing, running a
command, generating media, or using a named integration. The classification is
a pure function of the tool's identity. It needs no model request and does not
change when a chat is reopened.

The master also identifies a turn's final answer. An adapter's explicit answer
or commentary classification is authoritative. Without one, the turn's
concluding assistant response that requested no further tool work is the answer.
A stopped turn has no inferred answer, because its last text can be an interrupted partial response. Earlier responses, and any response that requested tools, are commentary. A turn
that ended without such a response has no final answer; its outcome and factual
account remain visible instead.

Clients group commentary and activity beneath each turn's header and keep the
final answer visible. The grouping and disclosure state belong to the client.
The [experience](./experience.md#read-each-finished-turn) defines the result.

## Performance is a product claim

The master is evaluated on representative tasks with stated success criteria.
A behavioral change earns its place through improved outcomes under an explicit
cost and latency allowance. Model identity, policy revision, capability set,
environment, and resource allowance are recorded so comparisons are interpretable.
When work uses a whole-agent backend, comparisons also identify that agent and
the controls actually available to the outer master.

| Dimension        | Evidence                                                                                  |
| ---------------- | ----------------------------------------------------------------------------------------- |
| Task success     | Independent assessment against the request's success criteria                             |
| Artifact quality | Relevant visual, functional, structural, or factual checks                                |
| Early usefulness | Time until a meaningful artifact is available for inspection, when the task calls for one |
| Initiative       | Necessary work completed and avoidable interruptions imposed on the user                  |
| Reliability      | Correct continuation after missing capabilities, failures, and interruption               |
| Economy          | Time, inference usage, tool cost, and unnecessary repeated work                           |
| Communication    | Accurate progress, actionable questions, and an understandable final account              |

Ultra must demonstrate additional useful effort and improved outcomes on tasks
that benefit from it, with its additional cost and latency reported. Simple
tasks can finish early. A greater count of steps or delegated agents is an
execution measurement whose value depends on the resulting work.

Core overhead has a separate measurement. Scheduling, state publication, stream
delivery, and recovery can be measured using fixed decisions and recorded
component outcomes. Holding those decisions fixed separates a machinery change
from a product strategy change.

## Conformance examples

| Situation                                                           | Required master behavior                                                                                |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| A user asks for a visual adjustment                                 | Select an observation that can establish the resulting appearance and use it in the completion decision |
| Ultra is selected while Plan is active                              | Allocate more investigation or review within Plan's authority                                           |
| A tool catalog changes during a model response                      | Resolve that response against its captured tool set and admit later work against a fresh snapshot       |
| The user stops with two requests queued                             | Cancel active work, preserve the queued requests, and await explicit resumption                         |
| A process restarts after a potentially completed external operation | Reconcile the recorded operation before deciding whether to repeat it                                   |
| A verification step fails                                           | Repair within the remaining allowance or report the unresolved result                                   |
| Final-summary generation fails                                      | Publish the recorded outcome and available artifacts through a bounded fallback                         |
| A policy revision changes                                           | Preserve the meaning of accepted work and record the policy used for subsequent decisions               |

The separation is demonstrated by two masters with materially different context,
tool, verification, and continuation strategies using the same component
contracts. Each master must be understandable through its decisions and outcomes,
while component conformance holds independently of which product uses it.
