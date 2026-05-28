---
title: Triggers
description: Anything that fires a turn besides a human typing in the compositor. Scheduled wakeups, external webhooks (CI / GitHub / generic), programmatic API calls, MCP-pushed events, and agent self-scheduled wakeups. Trigger envelope shape, queue semantics, interactive-vs-hosted execution, agent self-scheduling pattern, lifecycle bounds, and the boundary with background subagents.
keywords:
  [
    agent-system,
    triggers,
    schedule,
    cron,
    webhook,
    routines,
    wake,
    automation,
    external-events,
    background,
  ]
format: md
tags:
  - internal
  - wg
  - agent-system
---

# Triggers

A **turn** in the agent system normally fires because a human typed
in the compositor and pressed enter. That is **one trigger source**.
Real systems have others:

- A cron expression matched the current time.
- A CI build finished and POSTed a webhook.
- A GitHub pull request opened.
- An external service called an HTTP API on behalf of an integration.
- The agent itself, on a prior turn, asked to be woken up later.
- An MCP server pushed a notification an active subscription is
  waiting on.

This page covers all of them under one model. The compositor stays
the canonical home for **human-composed input**
([`compositor`](./compositor.md)); this page is the canonical home
for **non-human-originated turns**. Both terminate in the same place
— a user message lands in the session, a turn fires, the loop runs.
What changes is the _origin envelope_ and the _queue / lifecycle
semantics_ the runtime applies.

## Trigger sources

| Source                                | Fires when                                                                              | Typical body                                                 | Persistence of the trigger config               |
| ------------------------------------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------ | ----------------------------------------------- |
| Compositor                            | The user submits via the compositor                                                     | Multipart user message (see [`compositor`](./compositor.md)) | Per-turn; no config to persist                  |
| Schedule (cron / one-time / interval) | A cron expression matches, or a one-time time-of-day is reached, or an interval elapses | A prompt template the schedule carries                       | Persistent host-level config                    |
| External webhook                      | An external service POSTs an event (CI, GitHub, generic)                                | The webhook payload, optionally massaged by a template       | Persistent host-level config + endpoint mapping |
| Programmatic API                      | External code POSTs to a per-session or per-routine endpoint with a bearer token        | Whatever the caller sent                                     | Persistent host-level config + auth credential  |
| Agent self-scheduled                  | The agent, on a prior turn, requested a wakeup; that wakeup's `when` is reached         | A prompt the agent supplied at request time                  | Persistent host-level schedule entry            |
| MCP-pushed event                      | An MCP server emits a notification an active subscription is waiting on                 | Server-defined; surfaced via a `data-*` part                 | Lives in the MCP session                        |

These are all real shapes. A conforming implementation MAY support a
subset — a CLI agent might have only the compositor; a cloud product
might have all six. The protocol shape below MUST be the same when
the source is supported.

The trigger-source taxonomy and the cron-schedule / API-POST /
webhook split match the convention established by
[Claude Code Routines](https://code.claude.com/docs/en/routines) — the
named conventional shape for hosts that ship this surface.

## The trigger envelope

A non-compositor trigger lands as a normal `user` message in the
session, with an additional `metadata_json.trigger` object that
discriminates the source:

```ts
chat_messages.metadata_json: {
  trigger: {
    source: "schedule" | "webhook" | "api" | "self-schedule" | "mcp-event",
    fired_at: int,                 // epoch ms when the trigger resolved
    schedule_id?: string,          // ref to the schedule entry, if persistent
    delivery_id?: string,          // upstream's event id, for idempotency
    headers?: object,              // safe subset of webhook headers
    auth_subject?: string,         // who/what authenticated the trigger
  },
  // …other user-message metadata (queued_at, snapshot_id, …)
}
```

The shape is normative — two conforming implementations MUST agree
on the field names so a session can be loaded by either side. The
trigger object is **absent** on compositor-originated user messages.
Readers can therefore use its presence as the discriminator: "was a
human at the keyboard for this turn?"

Why `role: "user"` and not a new role:

- The loop is identical regardless of who originated the message.
  The model sees user input either way.
- Persisting as `role: "user"` keeps the rewind / branch / queue /
  compaction code paths the same.
- A new role would bend the AI SDK chunk shape
  ([`foundations`](./foundations.md)) for no behavioral gain.

The cost of this choice is one indirection: an inspector showing
"who fired this turn" reads `metadata_json.trigger.source` rather
than `role`. The benefit is that everything else stays simple.

## Queue semantics

A trigger fires while another turn may be in progress on the same
session. The runtime MUST apply **the same queue-and-process-on-idle
rule** as compositor-originated user messages
([`ux / queued sends`](./ux.md#queued-sends)):

1. The trigger message is persisted immediately with
   `metadata_json.queued_at` set to the current epoch ms.
2. The session's run-state machine refuses to start a new turn while
   one is running.
3. When the previous turn finishes (or aborts), the run-state
   machine picks the **earliest by `queued_at`** unfired message,
   clears `queued_at`, and fires the turn.

Multiple queued triggers fire in order. Compositor-originated
messages and trigger-originated messages queue against each other
on `queued_at` — the user does not get jumped by a webhook, and the
webhook does not get jumped by the user. Determinism over priority.

A trigger MAY be **dropped** (not queued) under two conditions:

- **Duplicate `delivery_id`** — the upstream redelivered an event
  the runtime already has. Idempotency check.
- **Per-trigger throttle exceeded** — host policy caps how often a
  given trigger can fire (e.g. webhook-source has an hourly cap).
  Excess events are dropped, not queued, to avoid backlog overload.
  This matches the
  [Claude Code Routines](https://code.claude.com/docs/en/routines)
  per-routine / per-account hourly cap behavior.

Preemption (a trigger interrupts the running turn) is **not** in
the protocol. A host that needs preemption layers it via
`abort(session_id)` + retry — explicit, observable, never the
default.

## Where the trigger runs

The trigger source decides whether the trigger can fire while no
human is at the keyboard:

| Trigger source         | Requires the host to be running?                        |
| ---------------------- | ------------------------------------------------------- |
| Compositor             | Yes — the human IS the keyboard.                        |
| Schedule (interactive) | Yes — fires only while the host is open and idle.       |
| Schedule (hosted)      | **No** — fires on cloud infra; results land in the DB.  |
| External webhook       | **No** when hosted; yes when the host is the receiver.  |
| Programmatic API       | Depends — local API needs the host; cloud API does not. |
| Agent self-scheduled   | Whichever host the scheduler runs on.                   |
| MCP-pushed event       | Yes — the MCP subscription needs the loop running.      |

The interactive vs hosted split is a real product fork.

- **Interactive triggers** fire inside the user's running host (the
  laptop, the IDE, the CLI shell). They stop when the host closes.
  The default `/loop` pattern in
  [Claude Code](https://code.claude.com/docs/en/scheduled-tasks) is
  interactive.
- **Hosted triggers** run on the host vendor's cloud. The user's
  laptop can be closed. Results land in the persistent session
  store; the next time the user opens the session, they see what
  the agent did. This matches Claude Code Routines.

A conforming implementation MAY support either, both, or neither.
The protocol shape — trigger envelope, queue semantics, persistence
— is the same regardless of where the run actually executes.

## Agent self-scheduling

The agent, mid-turn, decides "this answer is incomplete; check on
it in 5 minutes." It needs to schedule itself.

This is a **host-supplied, agent-specific tool**, not a locked tool
([`tools`](./tools.md)). The shape:

```ts
request_wakeup({
  when: { kind: "delay_ms", value: 300000 } | { kind: "cron", value: "*/5 * * * *" } | { kind: "at", value: "2026-06-01T12:00:00Z" },
  prompt: string,                    // what the trigger message body should be
  reason: string,                    // short telemetry string; shown to the user
}) → { schedule_id: string }
```

Calling the tool MUST:

1. Persist the schedule entry in the host's scheduler with a
   reference back to the session.
2. Return a `schedule_id` the agent (or the user) can cancel.
3. When the wakeup fires, inject a user message into the session
   with `metadata_json.trigger.source = "self-schedule"`,
   `metadata_json.trigger.schedule_id = <id>`, and the prompt body
   the agent supplied.

The host MAY cap how far in the future the agent can schedule
(default: 7 days, matching Claude Code's `/loop` auto-expiry), how
many concurrent self-schedules a session can hold, and the total
compute self-scheduled turns can spend. The protocol does not set
the numbers; the host does.

Agent self-scheduling is **not** a way to escape supervision. Every
self-scheduled wakeup is a real turn, recorded in the session,
visible in the inspector, billable, and abortable. The user can
revoke any schedule the agent created.

## Lifecycle bounds

Triggers run forever unless bounded. Three load-bearing bounds:

- **Auto-expiry.** Every persistent trigger SHOULD carry a TTL. The
  recommended default is **7 days from creation**; the trigger fires
  one final time at expiry, then deletes itself. This is the
  [Claude Code `/loop`](https://code.claude.com/docs/en/scheduled-tasks)
  default and bounds how long a forgotten trigger can run.
- **Per-trigger throttle.** Each trigger SHOULD carry a maximum
  fire-rate (e.g. "at most 10 / hour"). Excess fires are dropped
  per the queue-drop rule above. This bounds an upstream firehose.
- **Per-account quota.** The host SHOULD cap total trigger-fired
  turns per user per day. This bounds runaway loops and aligns with
  product tier shapes (free / pro / team / enterprise).

Revocation paths the protocol assumes:

- The user can disable any trigger via the host's UI.
- The agent can cancel a self-schedule via the inverse of
  `request_wakeup` (`cancel_wakeup({ schedule_id })`).
- A trigger that hits its TTL self-deletes.

The host MAY surface a "triggered turns" filter in the picker so
the user can audit what fired while they were away.

## Relationship to background subagents

Both [background subagents](./subagents.md#blocking-vs-background)
and triggers fire turns the foreground user did not type. They are
distinct primitives:

| Aspect              | Background subagent                                  | Trigger                                                                  |
| ------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------ |
| Originator          | A parent agent called `task({ background: true })`   | An external clock, webhook, API, MCP event, or prior agent self-schedule |
| Lifetime            | Bounded by the parent session                        | Independent; survives parent close                                       |
| Completion delivery | Synthetic assistant message injected into the parent | A normal user message landing in the session                             |
| Persistence         | Child session row with `parent_id` set               | User message in the trigger's target session                             |
| Cancellation        | Aborting the parent cancels the background child     | Revoke the trigger; revoke does not abort an already-firing run          |

A subagent that wants to "wake up later" SHOULD NOT model that as a
background subagent — the child waiting on a clock is not work, it
is delay. It SHOULD use the trigger machinery instead.

A trigger that wants to "fan out into parallel work" MAY then call
`task({ background: true })` to spawn subagents from inside the
triggered turn. The two primitives compose; they do not overlap.

## Auth and trust

Triggers cross a real trust boundary — a non-human source is
asserting "fire this prompt against this session." Three layers
the host MUST apply:

1. **Authenticate the source.** Webhook signatures (Stripe, GitHub
   webhook secret, generic HMAC) are verified before the trigger
   envelope is built. API triggers carry a bearer token tied to a
   per-routine credential. Schedules are authenticated by being
   in the host's own scheduler.
2. **Authorize the target session.** A trigger MAY only fire
   against sessions it is configured against. The host stores the
   `(trigger_id, session_id)` mapping; the protocol does not.
3. **Audit the fire.** `metadata_json.trigger.delivery_id` and
   `metadata_json.trigger.auth_subject` are persisted on every
   triggered message so an inspector can answer "who fired this and
   when did upstream send it."

The watchdog ([`foundations / watchdog`](./foundations.md#watchdog))
runs on the trigger-fired turn the same way it runs on a
compositor turn. A triggered turn does not bypass tool permission
checks; if anything, hosts SHOULD apply a **stricter** permission
profile to triggered turns since there is no human present to
approve an `ask` outcome (headless behavior — see
[`foundations / watchdog`](./foundations.md#watchdog)).

## Implementor checklist

A conforming implementation that supports triggers MUST:

- Persist every trigger-fired turn as a `user` message with
  `metadata_json.trigger` set.
- Apply the same `queued_at` queue rule as the compositor; never
  start parallel turns on the same session.
- Honor `delivery_id` for idempotency; drop duplicates.
- Apply the watchdog to triggered turns and treat `ask` as `deny`
  when no human is present.
- Persist `auth_subject` for audit.

A conforming implementation that supports agent self-scheduling MUST:

- Expose a host-supplied `request_wakeup` / `cancel_wakeup` pair as
  agent-specific tools.
- Bound the future horizon (default: 7 days) and the in-flight
  self-schedule count per session (default: host policy).
- Cascade revocation: deleting a session deletes its self-schedules.

## What this guide does not specify

- **The webhook signature scheme.** HMAC-SHA256 with a per-source
  secret is conventional; the protocol does not pin the algorithm.
- **The cron-expression dialect.** Standard `* * * * *` vs Quartz
  vs other extensions are all conformant.
- **The hosted runtime.** Whether the trigger runs on the user's
  device or on cloud infra is a host product decision.
- **Per-trigger throttle defaults.** Hosts pick the hourly cap, the
  per-account daily cap, the TTL — the protocol names the contract
  (drop-on-cap, expire-on-TTL), not the numbers.
- **The `request_wakeup` tool's exact shape.** The doc above is the
  recommended shape for portability; implementors MAY substitute as
  long as the persisted `metadata_json.trigger` envelope is
  conformant.

## See also

- [Compositor](./compositor.md) — the human-originated trigger
  source; the canonical home for user-message vocabulary.
- [UX / queued sends](./ux.md#queued-sends) — the queue rule that
  triggers share with compositor messages.
- [Subagents / blocking vs background](./subagents.md#blocking-vs-background) —
  the sibling primitive for non-foreground turns.
- [Foundations / watchdog](./foundations.md#watchdog) — runs on
  triggered turns; `ask` SHOULD be treated as `deny` when no human
  is present.
- [Persistency](./persistency.md) — where the `metadata_json.trigger`
  envelope lives.
- [Tools](./tools.md) — `request_wakeup` is agent-specific, not
  locked.
- [Claude Code Routines](https://code.claude.com/docs/en/routines) —
  the named conventional shape (Scheduled / API / Webhook trigger
  sources) this page anchors on.
- [Claude Code `/loop` and scheduled tasks](https://code.claude.com/docs/en/scheduled-tasks) —
  the interactive `/loop` and cron-schedule conventions.
