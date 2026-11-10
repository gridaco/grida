---
title: Lifecycle Events
description: Session-scoped lifecycle facts, their delivery and ordering, and how a host uses them for background attention.
keywords:
  [
    agent-system,
    events,
    lifecycle,
    turn,
    notifications,
    approval,
    subscription,
    sse,
    observer,
    hooks,
  ]
format: md
tags:
  - internal
  - wg
  - agent-system
---

# Lifecycle Events

A turn can finish, fail, or reach an approval while its chat view is
closed. The turn owner can publish those facts after the corresponding
state is committed. A desktop shell, status surface, or other authorized
consumer subscribes independently of the chat's transcript stream.
The channel is volatile. The session remains the source of record.

The keywords **MUST**, **MUST NOT**, **SHOULD**, **SHOULD NOT**,
**MAY** are used as in
[RFC 2119](https://datatracker.ietf.org/doc/html/rfc2119).

## Why an event surface

The signals all exist inside the core already. The run-state machine
observes every turn's busy and idle edge; the approval gate persists
every pending approval. The gap is not detection — it is
**fan-out**: the lifecycle edges are observable at exactly one
internal seam, and that seam historically admitted exactly one
observer (the run-state machine itself). A second consumer could not
attach without displacing the first.

The naive fix is to wire the new consumer directly: let the desktop
shell reach into the runtime, or let the runtime call the
notification API. Both are wrong for the same reason:

1. **Consumers multiply; wiring per consumer forks the core.** A
   notification today, a badge count tomorrow, a usage logger, an
   external automation. Each hard-wired consumer adds a core change;
   each core change risks the run loop. An event surface adds
   consumers without touching the loop.
2. **The core must not know what a notification is.** Notification
   policy (when to show, when to suppress, what to say, what a click
   does) is a _host_ concern, entangled with focus state, windowing,
   and OS APIs the core has no business importing. The core states
   facts; the host decides presentation — the same authority
   direction as [turn authority](./turn-authority.md).

So the contract is split in two layers, and they must not be
conflated:

- **Mechanism** — the core emits typed lifecycle events on a
  multi-subscriber channel, and the host projects that channel to
  out-of-process consumers.
- **Consumer policy** — what any given consumer does with an event
  (notify, count, log) is its own, defined outside the core.

Peer agent runtimes have converged on the same split — a typed
internal event bus projected over a server event stream, with
notifications implemented as one subscriber among several, and the
same two user-attention moments (turn complete, approval needed) as
the canonical triggers. This page treats that convergence as
evidence, not as the spec; the contract below stands on its own.

## The event vocabulary

The channel carries **session-scoped lifecycle events**. A host that
exposes execution edges uses the following vocabulary. An attention
projection may select just the facts it needs.

### `turn-started`

A turn began on a session.

| Field        | Meaning                                                                                                                                                                                                                                           |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `session_id` | The session the turn runs on.                                                                                                                                                                                                                     |
| `message_id` | The user message the core fired for this turn — the [fired-message identity](./turn-authority.md#what-the-wire-must-carry) the turn-lifecycle wire is required to carry. Absent only when the turn was not fired from a user message (see below). |
| `at`         | Epoch milliseconds the turn started.                                                                                                                                                                                                              |

A turn that **resumes** a paused approval (the user answered
Allow/Deny and the prior turn's tool call continues) fires no new
user message; its `turn-started` carries no `message_id`. Every
queue-drained turn and every directly-submitted turn names the fired
message.

### `turn-finished`

A turn ended on a session.

| Field              | Meaning                                                                                                                                                                                                                                                                                     |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `session_id`       | The session the turn ran on.                                                                                                                                                                                                                                                                |
| `message_id`       | The fired message of the turn that just ended (same sourcing as `turn-started`).                                                                                                                                                                                                            |
| `reason`           | `finish` — natural completion. `abort` — the user cancelled. `error` — a hard failure ([which pauses the drain](./queue.md#the-run-state-machine)). The three transitions of [turn authority](./turn-authority.md#what-the-wire-must-carry), folded into one event with an explicit reason. |
| `pending_approval` | `true` iff the turn ended **blocked** on an unanswered supervised approval. A blocked turn ends with `reason: finish` — the run settled cleanly — but it is not a completed turn: the session is waiting on the user, not done.                                                             |
| `at`               | Epoch milliseconds the turn ended.                                                                                                                                                                                                                                                          |

`pending_approval` exists so a **stateless** consumer can tell "the
agent is done" apart from "the agent is waiting on you" without
correlating events: the two demand different presentation, and a
consumer that announces "finished" for a blocked turn is lying to the
user.

### `approval-requested`

A turn ended blocked on an unanswered supervised approval — the
discrete signal for the moment the session starts **waiting on the
user**. Emitted once per turn that ends blocked, alongside (and
ordered before) that turn's `turn-finished`.

| Field        | Meaning                                           |
| ------------ | ------------------------------------------------- |
| `session_id` | The session whose turn is blocked.                |
| `at`         | Epoch milliseconds the blocked state was reached. |

The event intentionally carries no approval payload (which tool,
which command). The authoritative pending-approval state — what is
being asked, its identifiers, how to answer — lives in the persisted
session and is read from there; the event is a **doorbell, not the
letter**. A consumer that needs the content reads the session. This
keeps the event channel volatile and the approval state durable, and
it means a forged or replayed event can never _answer_ anything.

## Semantics

- **Multi-subscriber.** Any number of consumers attach and detach
  independently. A subscriber MUST NOT displace another; a throwing
  subscriber MUST NOT break delivery to the rest or the run loop.
  This is normative because the historical failure mode is exactly a
  single-observer seam that silently overwrites.
- **Volatile, no replay.** The channel is a live feed. A late joiner
  sees only future events; a host restart loses nothing of record
  because nothing of record lives here. Durable facts (run state,
  queue, pending approvals, transcripts) live in their authoritative
  stores; a consumer that needs current state on attach reads those
  stores, then tails the channel.
- **Per-session causal order.** Within one session, `turn-started`
  precedes its `turn-finished`; `approval-requested` precedes the
  `turn-finished` of the turn that blocked. Across sessions no order
  is promised.
- **Best-effort delivery.** Events MAY be lost on host shutdown or
  transport drop. A consumer MUST therefore treat events as
  _prompts to act or look_, never as a ledger. Anything that must
  not be missed belongs in a durable store, not on this channel.
- **The core never waits.** Emission is fire-and-forget. No
  subscriber can delay, veto, or mutate a turn. (A surface with
  blocking semantics is a hooks system — see
  [the boundary](#not-a-hooks-system) below.)

## Projection to consumers

The host chooses the transport and checks the recipient's authorized
scope before sending any event. One subscription can cover all the
sessions a consumer is allowed to observe, including sessions without
an open view. A host with separate workspace workers can use one
subscription per worker. Each worker checks session ownership before
delivery.

An attention consumer needs only two facts, a verified settlement
with its outcome or an outstanding approval wait. Both carry the chat
and turn identity. The host may project those facts alone. A consumer
that needs to render Stop or Send reads the
[session status](./session.md#session-status). Event delivery is
read-only and grants no authority to start a turn or answer approval.

## The first consumer: host notifications

The job that motivated the channel: when a turn finishes or blocks on
approval while the user is **not looking**, the host raises a native
OS notification; activating it brings the user to the session. This
section is the reference policy — informative for hosts that present
sessions differently, normative for the desktop shell.

### When to notify

This table is the policy's normative core, and it is exactly the kind
of small matrix that drifts silently — a new end reason lands in the
vocabulary and the consumer maps it to stale copy nobody decided on.
A host MUST therefore hold the table with two mechanical guards: the
mapping is **exhaustive** over the event vocabulary (growing the
vocabulary must fail the consumer's build until a row is decided, not
fall through to an old row), and an event or reason the consumer's
version does not know is **silent** (version skew between an agent
server and an older shell must never produce a wrong notification).
A host SHOULD additionally pin the table row-for-row with a contract
test in its own tree, so the doc and the behavior can be diffed by
eye.

| Event                                          | Notify?                                                                                                   |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `approval-requested`                           | Yes — highest value; the agent is stalled on the user.                                                    |
| `turn-finished`, `reason: finish`, not blocked | Yes — "done, come look."                                                                                  |
| `turn-finished`, `reason: finish`, blocked     | No — the `approval-requested` notification already covers it.                                             |
| `turn-finished`, `reason: error`               | Yes — the turn died and [the drain is paused](./queue.md#the-run-state-machine); the user must intervene. |
| `turn-finished`, `reason: abort`               | Never — the user did this themselves.                                                                     |
| `turn-started`                                 | Never — starting is not an attention moment.                                                              |

### Focus gating

A notification for something the user is already watching is noise.
The gate:

- If the host can resolve the session to a presenting surface (a
  window, a tab) and that surface **has focus**, suppress.
- If the session's surface exists but is not focused, or no surface
  presents the session at all (its window was closed; the turn was a
  queue drain with no client attached), notify.
- If the session cannot be resolved to any surface, fall back to
  app-level focus: suppress while the app is focused, notify while
  it is not.

Focus gating belongs to the consumer. Authorized attention facts can
arrive for a chat whose view is closed.

### Click-to-attend

Activating the notification MUST bring the user to the session:
focus the surface presenting it, opening one if none exists, and —
where the host supports addressing a session within a surface —
select that session. The resolution key is the session's workspace
binding; an unbound session falls back to the host's default
surface. A notification that cannot deep-link still MUST focus the
application.

## The seam under a foreign backend

The channel is deliberately the seam between **turn execution** and
**attention surfaces** — and that seam must hold when the thing
executing the turn is no longer the built-in runtime. A host that
adopts an external agent runtime as a session backend (for example,
one consumed over the [Agent Client Protocol](./acp.md)) takes on a
normative obligation:

- **The adapter owns emission.** Whatever component translates the
  foreign runtime's lifecycle into the host's sessions MUST also
  project it onto this vocabulary: the foreign turn's terminal
  outcome (however that runtime names its stop reasons) maps to
  `turn-finished` with the honest `reason`; the foreign runtime's
  permission/approval request maps to `approval-requested` and the
  blocked-finish semantics (`pending_approval`); a user cancel maps
  to `abort`.
- **Consumers stay backend-blind.** A notification consumer — or any
  other subscriber — MUST NOT need to know which backend ran the
  turn. If adopting a backend requires touching a consumer, the
  adapter has leaked; the fix belongs in the adapter.
- **Conformance is observable.** A backend adapter conforms when the
  [invariants below](#invariants) hold over its sessions exactly as
  they hold over the built-in runtime's: every turn emits
  started/finished, blocked turns ring the doorbell before their
  finish, and the events ride the same host-wide stream.

Stated once because the alternative is silent: nothing in a backend
integration _forces_ events to flow — sessions would still run,
transcripts would still render, and the first sign of the missing
emission would be a user quietly never notified. Treat "the events
still arise" as part of the definition of done for any new backend,
verified the same way the built-in runtime is.

## Not a hooks system

There is a larger, adjacent product: user-configured commands that
run on lifecycle events, can observe tool calls, and can **block or
mutate** them — the hooks systems of the major code agents. This
page deliberately does not build it, and the channel specified here
must not grow into it by accretion:

- This channel is **internal-or-trusted-consumer facing**: typed
  events for the host and its surfaces. A hooks system is
  **user-facing configuration** executing arbitrary user commands —
  a different trust model, a different config surface, a different
  failure domain (a hook that hangs must time out; a hook that
  blocks must be reasoned about in the permission model).
- This channel is **observe-only by construction**. Hooks earn their
  complexity exactly when they can veto or rewrite (pre-tool-use
  gates); none of the jobs this page serves needs that.

The proposed [hooks system](./hooks.md) owns executable handlers and blocking
decision points. It uses explicit lifecycle boundaries and retained invocation
results. This volatile observer channel alone cannot supply those guarantees.
Notification consumers continue to use the channel without gaining authority
to alter work.

## Invariants

A conforming implementation MUST hold all of these:

- The lifecycle seam admits **N observers**; attaching one never
  displaces another, and one observer's failure never breaks the
  rest or the run loop.
- Every turn the core runs — drained from the queue or submitted
  directly — emits `turn-started` and (unless the host dies first)
  exactly one `turn-finished` with an explicit reason.
- `turn-started` for a message-fired turn names the fired
  `message_id` ([turn authority](./turn-authority.md)).
- A turn that ends blocked on an unanswered approval emits
  `approval-requested` before its `turn-finished`, and that
  `turn-finished` carries `pending_approval: true`.
- The channel is volatile and observe-only: no replay, no
  durability, no consumer can affect a turn through it.
- The projected stream is authenticated and host-wide.
- Notification policy, focus gating, and click routing live in the
  consumer, never in the core.

## What this guide does not specify

- **The transport and packetization** of the projected stream — SSE
  vs IPC vs polling, framing, reconnect cadence.
- **Notification presentation** — wording, sounds, grouping,
  per-user preference surfaces. A host SHOULD let the user mute
  notifications; where that preference lives is the host's concern.
- **Event enrichment** — whether events later carry denormalized
  display data (titles, workspace names). The contract above is the
  floor; additive fields are a host negotiation.
- **A user-facing hooks system** — out of scope by design, above.

## See also

- [Turn Authority](./turn-authority.md) — the authority direction
  and fired-message identity this channel's reports carry.
- [Turn Queue](./queue.md) — the run-state machine whose edges these
  events project; drain pausing on error and on pending approval.
- [Session Lifecycle](./session.md#session-status) — the per-session
  status back-channel this channel complements, and the persisted
  approval state the doorbell points at.
- [Triggers](./triggers.md) — non-human turn sources whose turns
  emit the same events (a scheduled turn that fails wants the same
  notification as a human one).
