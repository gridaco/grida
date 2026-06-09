---
title: Turn Queue
description: The single point where competing demands to start a turn on one session are serialized, ordered, and drained. The ingestion model, the queued_at data shape, the run-state machine that drains the queue, the single-flight / FIFO / no-preemption invariants, the drop rules, restart behavior, and the core-vs-surface boundary that keeps the queue authoritative in the core.
keywords:
  [
    agent-system,
    queue,
    turn,
    run-state,
    scheduling,
    queued_at,
    single-flight,
    determinism,
    drain,
    backpressure,
  ]
format: md
tags:
  - internal
  - wg
  - agent-system
---

# Turn Queue

A session runs **one turn at a time**. Many things want to start a
turn: a human typing in the compositor, a cron expression matching, a
webhook landing, an API call, an agent self-schedule, an MCP push.
The turn queue is the single point where those competing demands are
**serialized, ordered, and drained**.

This page owns that contract: the ingestion model, the `queued_at`
data shape, the run-state machine that drains the queue, the
invariants every implementor MUST honor, and the boundary between
what the core owns and what a host or UI may build on top.

The turn _sources_ live elsewhere — human input in
[`compositor`](./compositor.md), non-human input in
[`triggers`](./triggers.md). This page is about what happens **after**
a turn-triggering message exists and **before** its turn fires.

The keywords **MUST**, **MUST NOT**, **SHOULD**, **SHOULD NOT**,
**MAY** are used as in
[RFC 2119](https://datatracker.ietf.org/doc/html/rfc2119).

## Why a queue

Two turns running on one session at the same time is a footgun. They
would race on the same conversation history, the same tools, the same
run state, and the same token rollup. The result is non-deterministic
and unrecoverable.

So **at most one turn runs per session**. That invariant forces a
decision about what to do with the _second_ demand that arrives while
the first turn is running. Three answers:

1. **Reject it.** The core returns "busy" and the caller retries
   later. This pushes the queue into every caller, loses determinism
   (retry timing decides order), and breaks every non-human source —
   a webhook or a cron has no keyboard to sit at and resubmit.
2. **Preempt the running turn.** The new message interrupts and
   replaces the in-flight turn. This is non-deterministic, throws
   away in-flight work and tokens, and makes "what did the agent
   actually see" unanswerable.
3. **Queue it.** Accept it, persist it, order it, and fire it when
   the session next goes idle. ← **chosen.**

The queue buys **determinism over priority**: the conversation
replays the same way every time, and no source jumps another.

## The model

### Every turn begins as a user message

All sources converge on one shape: a `user` message lands in the
session. The human path is the [`compositor`](./compositor.md); the
non-human path carries a `metadata_json.trigger` envelope
([`triggers`](./triggers.md#the-trigger-envelope)). The queue does
not care who originated the message — the presence of `trigger` is a
discriminator for auditing, not for ordering. A typed message and a
webhook obey the same queue rule.

This makes the queue the **foundation of the turn sources, not a
sibling of them.** The compositor and the trigger machinery are
**turn sources** that sit above the queue and feed it; the queue sits
below and serializes whatever they submit. The dependency runs one
way — a source knows it must enqueue; the queue knows nothing about
any particular source, carries the `trigger` envelope opaquely, and
never branches on it. So **triggers are built on the queue, not the
queue on triggers** — and it could not be the other way around: the
compositor is not a trigger (the human is the keyboard — no envelope,
no schedule, no auth), yet it feeds the same queue. Modeling the
queue on top of triggers would force the human path into a trigger
shape it does not fit.

### Queued vs fired

- A message is **queued** when it is persisted while a turn is
  already running, with `metadata_json.queued_at` set to the epoch ms
  at which it was queued.
- A message **fires** when the run-state machine clears its
  `queued_at` and starts its turn.
- A message that arrives while the session is **idle** fires
  immediately and never carries `queued_at`. `queued_at` present means
  "this message waited."

### Single-flight

At most one turn per session is in the running state at any instant.
The idle→busy transition MUST be atomic, so two near-simultaneous
arrivals cannot both win the run; the loser is queued.

### Order

The queue preserves **`queued_at` order**. When the session goes
idle, the run-state machine consumes queued messages in that order;
whether it consumes one per turn or all pending at once is the
implementer's [drain discipline](#drain-discipline). Either way order
is preserved — a later message never fires ahead of an earlier one.
Human- and trigger-originated messages queue against the **same
clock** — the user is not jumped by a webhook, and the webhook is not
jumped by the user. Determinism over priority.

### No preemption

A new message never interrupts the running turn. Preemption is not in
this contract. A host that needs "stop and run this now" composes it
from two existing operations:
[`abort(session_id)`](./session.md#interruption) followed by a
submit. Explicit, observable, never the default.

## The run-state machine

The queue is drained by the **run-state machine** — the core
component that owns whether a session is running and what fires next.
Its states are `idle` / `busy` / `retrying` / `error`. These project
onto the client-facing `SessionStatus` back-channel; the wire shape
and its transport live in
[`session / session status`](./session.md#session-status). This page
owns the _behavior_; that page owns the _shape clients read_.

**Drain rule.** On entering `idle` — when the running turn finishes
or is aborted — the machine selects the next batch of queued messages
in `queued_at` order (one message, or all currently queued, per the
[drain discipline](#drain-discipline)), clears their `queued_at`,
transitions to `busy`, and fires the turn. If nothing is queued, it
stays `idle`.

**Where it lives.** The core. The machine is authoritative; it is not
the UI, and it is not any single client. Every client of the session
— a second window, a hosted trigger runner with no UI at all, an
inspector — sees the same queue because the queue is core state, not
client state.

**Hard failure pauses the drain.** A turn that hard-fails
(state → `error`) does **not** auto-drain. Auto-firing the next
queued turn into a session that just broke would cascade the failure
— acutely dangerous under a trigger storm. So on hard error the queue
is **paused**: queued messages keep their `queued_at` and wait. The
drain resumes when `error` clears, which happens on the next fired
turn (a user retry, an edit-and-resend, or an explicit resume). A
_transient_ failure is different: the turn is still the running turn
(`retrying`), so the queue is not drained mid-retry; it drains only
once the turn reaches a clean `idle`.

**A blocked turn pauses the drain.** A turn that pauses **awaiting a
user decision** — a supervised-approval Allow/Deny, or any other
human-in-the-loop block on the current turn — is **not a completed
turn**, even though it may end the run's stream and read as `idle`.
Firing the next queued turn into that gap would run it _before_ the
user resolves the block, reordering the user's own intent. So a
pending block pauses the drain exactly like a hard error: queued
messages keep their `queued_at` and wait. The drain resumes once the
user resolves the block and the turn continues to a **true finish**.
`idle` alone is therefore not a sufficient drainability test — the
drain fires only when the session is genuinely ready for a _new_ turn,
which a blocked turn is not. The block state is authoritative session
state (a persisted pending approval), so every consumer — a second
window, a hosted runner, the CLI — honors the pause identically.

### Stopping with a queue

A user **abort** ([`session / interruption`](./session.md#interruption))
is a clean way to reach `idle`, so it drains exactly like a natural
finish: aborting the running turn fires the next batch. **Stop ends
the current turn, not the queue.** Halting the whole cascade means
**cancelling** the queued messages (see
[operating on queued messages](#operating-on-queued-messages)) —
abort alone rolls into the next one. An implementation MAY offer a
combined "stop and clear" affordance, but the underlying abort and
cancel stay separate primitives; collapsing them would remove the
ability to end one turn while keeping the queue.

## Drain discipline

How many queued messages the drain consumes per turn is a policy each
implementer picks. Two disciplines are common:

- **Serial** — the drain fires **one** message per turn, earliest
  first. N queued messages produce N turns. Each gets its own
  assistant response and its own rewind point; the agent reacts to
  them one at a time.
- **Coalescing** — the drain folds **all** currently-queued messages
  into a **single** turn, in `queued_at` order. N queued messages
  produce one turn. The agent sees the whole pending batch at once;
  fewer turns, fewer model round-trips.

Both honor every [invariant](#invariants) — single-flight, `queued_at`
order, no preemption. They differ only in **turn granularity**:
serial trades round-trips for finer-grained history and rewind;
coalescing trades granularity for cost and for letting the agent
react to everything at once. The discipline is fixed per
implementation; this guide does not mandate one.

**Drain cadence is a host policy.** The drain rule fires the next batch
"when the session goes idle" — but an implementation MAY insert a brief
**settle delay** between the idle edge and the next fire. The session is
genuinely `idle` for that window (no turn running) and the next batch stays
**queued** for its duration — its `queued_at` is cleared only when it fires.
This gives every client time to observe the idle transition, and lets a
surface keep showing the still-pending batch as queued so it appears to
"submit" in step with its response rather than flushing early. Useful where a
surface projects run-state to a control (a stop/send toggle) that would
otherwise never paint the idle state on a back-to-back drain. The delay
changes only cadence, never an [invariant](#invariants); its duration is the
host's, like the [throttle and dedup numbers](#drop-rules--what-does-not-queue).

Messages that arrive **after** a drain has begun belong to the
**next** batch, never the one already firing — a batch is whatever was
queued at the instant the session reached `idle`. This is what keeps a
coalescing drain deterministic.

## Lifecycle

The full path, from any source to a fired turn:

1. A turn-triggering message arrives.
2. The core persists it as a `user` message **immediately**, before
   deciding whether to run it. The persisted-message store _is_ the
   queue; there is no separate queue structure.
3. If the session is **idle**, the machine fires the turn now (no
   `queued_at`). If **busy** or **retrying**, the message is stamped
   `queued_at` and the machine does **not** start a turn.
4. When the running turn reaches **idle**, the drain rule fires the
   earliest queued message.
5. Steps 3–4 repeat until the queue is empty.

## Operating on queued messages

While a message waits in the queue it can be acted on; once it fires
it is an ordinary user message and any change is a
[rewind](./session.md#rewinding), not a queue operation.

- **Cancel** (remove) — a conforming implementation SHOULD expose
  this. It removes a queued message before it fires, and it is the
  **only** way to halt the drain cascade: because an abort drains the
  next batch, stopping the queue means cancelling its messages.
- **Edit** — an implementation MAY let the user rewrite a queued
  message's parts in place (`queued_at` and order unchanged). One
  that does not build in-place edit can rely on **cancel + resubmit**
  for the same effect.
- **Reorder** — an implementation MAY let the user reorder queued
  messages. The default order is `queued_at`; reordering is a
  convenience that changes only the order the drain consumes, no
  other invariant.

These are the only operations on a queued message; how they surface
is a host concern ([`ux / queued sends`](./ux.md#queued-sends)).

## Drop rules — what does not queue

Not every arriving message reaches the queue. **Admission is a
source-layer decision, made before submit** — the queue itself
accepts whatever a source hands it and owns no drop policy. The
trigger machinery is the only source that drops, under two host
policies, both defined in
[`triggers / queue semantics`](./triggers.md#queue-semantics):

- **Duplicate `delivery_id`.** The upstream redelivered an event the
  session already holds. Idempotency.
- **Throttle exceeded.** Host policy caps a trigger's fire-rate;
  excess fires are dropped, not queued, so an upstream firehose
  cannot build an unbounded backlog.

A **dropped** message is distinct from a **cancelled** one: dropped
never enters the queue; cancelled was queued and removed.

## Persistence and restart

The queue is **not a separate data structure** — it is exactly the
set of persisted `user` messages that carry a `queued_at` and have
not yet fired (the `queued_at` metadata key is defined in
[`persistency / chat_messages`](./persistency.md#chat_messages)).

This has a free consequence: the queue **survives a host restart**.
`SessionStatus` is volatile, so after a restart every session reads
as `idle` ([`session / session status`](./session.md#session-status));
the run-state machine then resumes by draining any still-queued
messages. A turn that was _running_ at restart is **not** resumed —
cross-restart run-resume is out of scope, and its orphaned in-flight
tool calls are finalized as errors
([`session / resume`](./session.md#resume-across-renderer-disconnect))
— but that turn's queued successors still drain normally.

## The core / host / UI boundary

This is the line the contract draws — and the one most easily
blurred. The queue is **core, not surface.**

| Concern                                 | Owner                          |
| --------------------------------------- | ------------------------------ |
| Accepting a turn-triggering message     | Core                           |
| Persisting it and stamping `queued_at`  | Core                           |
| Single-flight enforcement               | Core                           |
| Ordering and draining                   | Core (the run-state machine)   |
| Projecting state onto `SessionStatus`   | Core                           |
| Edit / cancel of a queued message       | Core operations                |
| Rendering queued messages               | UI                             |
| Edit / cancel affordances               | UI (calls the core operations) |
| Reading `SessionStatus` for busy / idle | UI / host                      |
| Status transport (event bus, polling)   | Host                           |

A conforming UI **MUST NOT** implement a private hold-and-resubmit
queue as the source of truth — holding messages client-side and
replaying them on idle makes the queue invisible to every other
client of the session, to triggers, and to the inspector, and it
silently drops the moment the client closes. The UI **MAY** render
optimistically (show a message as queued before the core confirms),
but the authoritative queue is always the persisted-message set the
core drains. A host with no human present — a scripted job, a hosted
trigger runner — depends on this: there is no UI there to hold
anything.

## Invariants

A conforming implementation MUST hold all of these:

- At most one turn runs per session at any instant.
- The idle→busy transition is atomic.
- The drain fires the earliest unfired `queued_at` message; ties are
  broken deterministically (e.g. by message id).
- Human- and trigger-originated messages share one FIFO clock; no
  source is prioritized.
- A new message never preempts the running turn.
- A hard-failed turn pauses the drain; queued messages persist and
  resume on the next fired turn.
- Every fired message becomes a real, recorded turn — billable,
  inspectable, abortable. There is no shadow execution.
- The queue holds no state the persisted-message store does not; it
  is recoverable from the messages alone.
- The drain discipline (serial or coalescing) changes turn
  granularity only — never single-flight, order, or preemption.

## What this guide does not specify

- **A priority queue.** Determinism over priority is deliberate. A
  host that needs urgency composes abort+submit; it does not get a
  priority lane.
- **The drain discipline.** Serial (one message per turn) or
  coalescing (all pending in one turn) — both conform; see
  [Drain discipline](#drain-discipline).
- **The status transport.** Event bus, SSE, polling — all conformant.
  The `SessionStatus` shape is in [`session`](./session.md#session-status);
  delivery is the host's.
- **Throttle and dedup numbers.** The drop _contract_ is here; the
  caps (hourly rate, per-account quota, TTL) are the host's, per
  [`triggers / lifecycle bounds`](./triggers.md#lifecycle-bounds).
- **Whether the UI shows a queue list, a count, or nothing.**
  Rendering is host territory; the persisted queue is what it renders.
- **Cross-restart run-resume.** Only the _queue_ drains after a
  restart; a _running_ turn is not resumed.

## See also

- [Compositor](./compositor.md) — the human turn source.
- [Triggers](./triggers.md) — the non-human turn sources and the
  drop rules the trigger layer applies before enqueue.
- [Session / session status](./session.md#session-status) — the
  `SessionStatus` wire shape this machine projects onto, and the
  abort path the no-preemption rule composes with.
- [Session / rewinding](./session.md#rewinding) — what editing a
  message becomes once it has fired.
- [Persistency](./persistency.md#chat_messages) — the `queued_at`
  metadata key the queue is made of.
- [UX / queued sends](./ux.md#queued-sends) — the user-facing framing
  that rides on this contract.
- [Subagents](./subagents.md#blocking-vs-background) — background
  subagents inject a completion message that queues like any other.
