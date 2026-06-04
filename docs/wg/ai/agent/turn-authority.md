---
title: Turn Authority
description: The host states what happened; the client renders it. The turn-lifecycle wire vocabulary must carry the identity of the message the core actually fired and explicit started/finished/aborted transitions, so a client never infers which queued item became a real turn from its own optimistic mirror. The authority direction, the lifecycle contract, why reconstruction forks across consumers, and the migration from a state-only status channel.
keywords:
  [
    agent-system,
    turn,
    turn-lifecycle,
    authority,
    session-status,
    queue,
    drain,
    promote,
    optimistic-mirror,
    reconciliation,
    fired-message-id,
    contract,
  ]
format: md
tags:
  - internal
  - wg
  - agent-system
---

# Turn Authority

A session's run-state lives in the **core**, and only the core knows
which message just became a running turn. Yet a client must still
render that turn: append the fired user message to the transcript,
attach to its stream, stop showing it as pending. The question this
page settles is **how the client learns which message the core
fired** — and the answer is a single rule:

> **The host states what happened; the client renders it.** A client
> MUST NOT reconstruct which queued message became a turn from its own
> local state. The fact travels on the wire, sourced from the core.

This is the inverse of an easy mistake. When the [Turn
Queue](./queue.md) drains, the natural-seeming shortcut is for a
client to watch its own status back-channel, see the session go busy,
and conclude "the core must have just fired the head of my queue." It
then promotes that head into the transcript. The shortcut is wrong,
and this page explains why, and what the wire must carry instead.

The keywords **MUST**, **MUST NOT**, **SHOULD**, **SHOULD NOT**,
**MAY** are used as in
[RFC 2119](https://datatracker.ietf.org/doc/html/rfc2119).

## The problem: a status channel that omits identity

The [session status](./session.md#session-status) back-channel
projects the [run-state machine](./queue.md#the-run-state-machine):
`idle` / `busy` / `retrying` / `error`, with an optional retry
`attempt`, a human-readable `message`, and a `started_at`. It answers
**"is a turn running?"** It does **not** answer **"which message is
the turn running?"**

That omission is harmless for the channel's original job — painting a
Stop/Send control, surfacing a retry delay. It becomes a correctness
hole the moment a client uses the `idle → busy` edge to drive the
**queue drain promotion**: the act of moving a queued message into the
transcript when the core fires it.

Here is the race, in domain terms:

1. A client keeps an **optimistic mirror** of the queue — a local,
   FIFO-ordered copy of the pending messages, for instant feedback.
   It is a [display nicety, not an authority](./queue.md#the-core--host--ui-boundary);
   the authoritative queue is the core's persisted-message set.
2. The core drains **serially**: on a clean idle edge it dequeues the
   earliest pending message (clears its `queued_at`), then fires its
   turn. The status channel flips to `busy`.
3. The client sees the `busy` edge. Because the status frame carries
   no message identity, the client **guesses** that the core fired the
   head of its mirror, and promotes that head into the transcript —
   reusing its id, so a later hydrate cannot duplicate it.
4. The client's mirror reconciles against the core's queue only
   **afterward**, asynchronously (a re-read triggered by the same
   edge).

On a single drain this guess is usually right: the mirror head is the
message the core fired. But on a **rapid serial drain** — two queued
items fired back-to-back, with the second `busy` edge arriving before
the mirror has reconciled away the first — the mirror's head is still
the **previous** item. The client promotes the **wrong** message into
the transcript, stamping it with that wrong message's id, while a
**different** turn's response streams in beneath it. The transcript
now shows a question that does not match its answer, and the id reuse
means the mistake survives a reload.

The defect is not a timing bug to be papered over with a longer
settle delay. It is **structural**: the client is reconstructing
server truth from local optimism, and the two are allowed to diverge
by design (the mirror reconciles asynchronously, precisely so the UI
can feel instant). Any contract that asks a client to infer _which_
message fired from a signal that only says _that_ a turn fired will
race. The fix is to stop inferring.

## Why this is trajectory-critical

A single client guessing wrong is a bug in one surface. The reason
this earns its own page — rather than a footnote on the queue — is
that the turn-lifecycle channel is about to gain **more consumers**,
and "reconstruct server state from local guesses" is a contract that
**forks per host**.

Today the renderer is the only consumer. Tomorrow the same run-state
lives behind a [cloud agent
runtime](../../platform/grida-cloud-agent-runtime.md) and a
`grida-agent` CLI. Each is a different process, with a different local
model of the queue, a different reconciliation cadence, a different
notion of "the head of my mirror":

- A **renderer** holds an optimistic mirror keyed to a human typing,
  reconciled on stream-end and status edges.
- A **CLI** may hold no mirror at all — it submits, then tails — and
  has nothing to promote _from_.
- A **cloud runtime** with no human present has no compositor, no
  tray, and no reason to mirror; it is a pure observer that records
  and bills turns.

If the contract is "watch the busy edge and infer the message," then
each of these three must independently reimplement the inference, each
gets the rapid-drain race slightly differently, and the queue / fork /
rewind surface multiplies subtle, host-specific bugs that no shared
test can catch — because the racing logic lives in the host, not the
core. A turn promoted to the wrong id corrupts the rewind checkpoints
([rewind is to a user message](./session.md#rewinding)) and the fork
points ([a fork copies up to a message
id](./session.md#forking)) that are keyed on that id.

The cross-cutting nature is exactly the test for an own-page contract:
the join point between "core decides what runs" and "client renders
what ran" is owned by **neither** the queue page (which owns _ordering
and draining_) nor the session page (which owns _the status shape_).
It is the **authority direction** between them, and it must be stated
once, normatively, before three consumers each invent their own.

## The contract

### Authority direction

The core is the single authority on turn lifecycle. Concretely:

- The core **MUST** be the only component that decides which message
  becomes a running turn (it already is — the [drain lives in the
  core](./queue.md#the-run-state-machine)).
- The core **MUST** report that decision on the wire, naming the
  message it fired.
- A client **MUST** treat that report as the source of truth for the
  promote decision. It **MUST NOT** derive the fired message from its
  own queue mirror, its own FIFO assumption, or the mere fact of a
  busy edge.

The optimistic mirror does not disappear — instant feedback is worth
keeping — but it is **demoted**. It MAY drive what the user _sees as
pending_ between submit and confirmation; it MUST NOT drive _which
message is promoted to a real turn_. The mirror is reconciled against
authoritative events; it never reconstructs them.

### What the wire must carry

The turn-lifecycle channel MUST carry, in addition to the run-state it
already projects, the **identity of the message the core fired** and
**explicit lifecycle transitions**. The minimum vocabulary a conforming
host emits and a conforming client reads:

- **Turn started** — a turn began, naming the `message_id` of the user
  message the core dequeued and fired. This is the signal a client
  promotes on: it knows _exactly_ which message to move into the
  transcript and which id to stamp it with, with no inference.
- **Turn finished** — the turn reached a clean idle (natural finish or
  abort), with its `message_id`. This closes the lifecycle for that
  message and lets a client settle its rendering.
- **Turn aborted / failed** — the turn ended abnormally, with its
  `message_id` and a reason. Distinguished from a clean finish because
  a [hard error pauses the drain](./queue.md#the-run-state-machine)
  and the client must reflect that the queue did not advance.

The existing `idle` / `busy` / `retrying` / `error` projection
remains — it answers "is a turn running, and should I paint
Stop/Send?" The lifecycle transitions are **additive**: they answer
"_which_ turn, and what became of it?" A host MAY fold both into one
frame (a busy frame that also names the fired `message_id`) or carry
them on parallel channels; the normative requirement is that the
fired-message identity is **present and authoritative**, not how it is
packetized.

What this buys, stated as an invariant:

> **Every started-turn report names the message the core fired.** A
> client never has to ask "which of my pending messages just became a
> turn" — the report already said.

### Clients become pure renderers

With identity on the wire, every consumer collapses to the same shape,
regardless of whether it holds a mirror:

- On **turn started** for a `message_id`, the client promotes _that_
  message — by its id — into the transcript and attaches to the
  stream. If the client holds an optimistic mirror, it drops the named
  row from the mirror in the same step (an atomic move); a client with
  no mirror simply hydrates the message by id. Either way the decision
  came from the host, not from local order.
- A turn the client _started itself_ still needs no promotion — it
  already has its own optimistic message and stream. The started-turn
  report for a self-initiated turn is a confirmation, not a new
  promotion; a client recognizes its own turn by the `message_id` it
  submitted.
- On **turn finished / aborted**, the client settles or re-renders by
  `message_id`. No client guesses; all three consumers
  (renderer, CLI, cloud runtime) read the same fact and render it
  their own way.

This is the same strict-layering discipline the [streaming
layer](./session.md#strict-layering) already holds — the core states,
the host transports, the client renders — extended from the chunk
stream to the turn-lifecycle back-channel. The chunk stream already
names what it is producing; the lifecycle channel must too.

### Honest host → client lifecycle

The test for a conforming channel is the one the doctrine applies to
any wire: **could a second consumer, written by a different author in
a different language, render turns correctly without reading the first
consumer's code?** A state-only channel fails this test — the second
author must reverse-engineer the renderer's mirror-and-guess logic to
match its behavior, and will get the rapid-drain race wrong. A channel
that names the fired message passes it — the second author reads the
`message_id` off the started-turn report and renders it, full stop.

An honest lifecycle channel is therefore one where **the host never
makes the client compute a fact the host already knows.** The host
knows which message it dequeued; it dequeued it. Withholding that id
and forcing the client to re-derive it from a mirror is the channel
lying by omission — it reports _that_ a turn started while hiding
_which_, leaving the client to fill the gap with a guess that is right
most of the time and silently corrupts the transcript the rest.

## Alternatives considered

### Lengthen the settle delay so the mirror always reconciles first

The [drain cadence](./queue.md#drain-discipline) already inserts a
settle delay between idle and the next fire. One could widen it until
the mirror is guaranteed to have reconciled before the next `busy`
edge. **Rejected:** it trades correctness for a tuning constant. The
delay would have to bound the slowest reconciliation round-trip of the
slowest consumer, it slows every drain for every user to mask a race
in one, and it is still only _probabilistically_ safe — a slow network
re-opens the window. It treats a structural defect as a timing knob.

### Have each client poll the authoritative queue on the busy edge

A client could, on seeing `busy`, synchronously re-read the core's
queue and diff it to learn which message left. **Rejected:** it is the
same inference relocated. The client still reconstructs "which message
fired" from "which message is missing from the queue now," which
races against a _second_ drain that already removed two messages, and
against the client's own pending optimistic adds. It also forces a
round-trip on every busy edge. The core already knows the answer at
fire time; making N consumers each re-derive it from queue diffs is
the fork-per-host failure restated.

### A client-private hold-and-resubmit queue (no core drain)

Drop the core drain entirely and let each client hold its pending
messages and resubmit them on idle. **Rejected for the same reason the
[queue page](./queue.md#the-core--host--ui-boundary) rejects it:** a
client-private queue is invisible to every other consumer, drops when
the client closes, and cannot serve a host with no human present. The
cloud runtime and CLI make this non-negotiable — there is no client
there to hold anything. The drain must stay in the core; this page is
about making the core's drain _legible_ to clients, not about moving
it.

### Keep status-only, document the race as a known limitation

**Rejected:** the limitation corrupts the rewind and fork checkpoints
that the whole session model is keyed on, and it is about to be
inherited by two more consumers. A documented footgun that multiplies
across hosts is not a limitation; it is a defect deferred.

## Migration notes

This is an additive protocol change, not a breaking one. The
sequencing a host follows:

1. **Add the fired-message identity to the started-turn report.** The
   core already has the id at dequeue time; the change is to _emit_ it
   rather than discard it. Existing consumers that read only the
   run-state continue to work — the field is additive.
2. **Switch the promote decision to read the reported id.** A client
   that previously promoted its mirror head now promotes the named
   `message_id`. The optimistic mirror stays for pending-state display
   and is reconciled against the reports, never consulted for the
   promote.
3. **Add finished / aborted transitions** so a client can settle by id
   and reflect a [paused drain](./queue.md#the-run-state-machine) on
   hard error without inferring it from a bare `error` state.

A host that has not yet migrated still renders turns — it just keeps
the rapid-drain race until step 2 lands. There is no flag day: the
identity field is present-and-ignored until a consumer reads it.

The contract is the same for every consumer that comes after. A new
`grida-agent` CLI or a cloud runtime built against this page reads the
fired `message_id` and never reimplements the inference — which is the
entire point of writing it down once, here, before they exist.

## Invariants

A conforming implementation MUST hold all of these:

- The core is the sole authority on which message becomes a running
  turn, and reports that identity on the turn-lifecycle wire.
- Every started-turn report names the `message_id` of the fired
  message. A client never infers it.
- A client MUST NOT use a bare run-state edge (`idle → busy`) to decide
  _which_ message to promote; it promotes the named message only.
- The optimistic mirror is a display nicety reconciled against
  authoritative lifecycle events — never the source of the promote
  decision.
- Turn-lifecycle transitions (started / finished / aborted) are keyed
  on `message_id`, so rewind and fork checkpoints stay consistent
  across reload.
- The contract is identical for every consumer (renderer, CLI, cloud
  runtime); none reimplements the inference.

## What this guide does not specify

- **The packetization.** Whether the fired-message identity rides on
  the existing status frame or a parallel lifecycle channel, and
  whether the transport is SSE, IPC, or polling, is the host's — same
  as the [status transport](./queue.md#what-this-guide-does-not-specify).
- **Whether a client keeps an optimistic mirror at all.** A renderer
  wants one for instant feedback; a CLI may not. The contract requires
  only that _if_ a mirror exists it is reconciled, never authoritative.
- **The drain discipline.** Serial vs coalescing is the [queue
  page's](./queue.md#drain-discipline) concern. A coalescing drain
  reports the fired turn's constituent message ids by the same rule;
  the identity requirement does not change with granularity.

## See also

- [Turn Queue](./queue.md) — the run-state machine and drain this
  contract makes legible; the core-vs-surface boundary that demotes the
  client mirror to a display nicety.
- [Session / session status](./session.md#session-status) — the
  run-state back-channel this contract extends with fired-message
  identity.
- [Session / rewinding](./session.md#rewinding) and
  [forking](./session.md#forking) — the `message_id`-keyed checkpoints
  a wrong promotion corrupts.
- [UX / queued sends](./ux.md#queued-sends) — the user-facing framing
  of the queue whose drain this governs.
- [Deferred Grida Cloud Agent Provider](../../platform/grida-cloud-agent-runtime.md)
  — one of the additional consumers this contract is written ahead of.
