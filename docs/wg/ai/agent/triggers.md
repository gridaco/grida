---
title: Triggers
description: What may start or resume work besides a person submitting input — scheduled wake-ups today, and the requirements any external source (configured schedules, webhooks, programmatic calls, protocol notifications) must meet before it can. Origin provenance, admission through the ordinary queue, trust, headless approval, and lifetime bounds.
keywords:
  [
    agent-system,
    triggers,
    wake-up,
    schedule,
    webhook,
    automation,
    provenance,
    headless,
    background,
  ]
format: md
tags:
  - internal
  - wg
  - agent-system
---

# Triggers

Most work starts because a person submits input. A **trigger** is any other
origin that starts or resumes work in a session. Triggers cross a trust
boundary that a person at the composer does not: something other than the
user is asserting that work should happen now. This page defines what every
trigger must satisfy. It defers to the canonical contracts for the mechanisms
they own.

The keywords **MUST**, **MUST NOT**, **SHOULD**, **SHOULD NOT**, and **MAY** are
used as in [RFC 2119](https://datatracker.ietf.org/doc/html/rfc2119).

## Origins

| Origin            | Status                             | Owner of the mechanism                                                                                                                  |
| ----------------- | ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Person            | Present                            | [Compositor](./compositor.md) and [Master / input during work](./master.md#input-during-work-and-stopping)                              |
| Scheduled wake-up | Present where the client allows it | [Master / scheduled wake-ups](./master.md#scheduled-wake-ups) and [Experience / schedule a wake-up](./experience.md#schedule-a-wake-up) |
| Owned child task  | Present                            | [Components / owned child sessions](./components.md#owned-child-sessions)                                                               |
| External source   | Not provided; requirements below   | This page                                                                                                                               |

An **external source** is anything outside the session that asks for work: a
user-configured schedule, a webhook from a build or review service, a
programmatic call from an integration, or a notification from a connected
protocol server. None is offered today. A host that adds one MUST meet every
requirement on this page before it fires.

## Requirements for every trigger

### Provenance is recorded

Each accepted input records its origin: a person, a wake-up with its task and
delivery identity, or an external source with its configuration identity, its
upstream delivery identity when one exists, and the authenticated subject that
asked. The origin is part of the durable record, so an inspector can answer who
or what started the work and when. The origin does not change the input's role
in the conversation; it is provenance, not a different kind of message.

### Admission is the ordinary queue

A trigger submits input through the same admission, queue, and claim rules as a
person. It never preempts a running turn, never starts a parallel turn in the
same session, and never jumps the queue. Pause, Stop, and an unanswered required
question hold triggered work exactly as they hold a person's work.

A trigger MAY be dropped **before** admission, and only there: a duplicate
upstream delivery identity is discarded for idempotency, and a source that
exceeds its configured rate is discarded rather than queued. Once accepted, the
input has one inspectable disposition like any other.

### Trust is established before admission

1. **Authenticate the source.** A wake-up is authenticated by being registered
   in the host's own durable timer. An external source proves its identity
   with a verified signature or a credential bound to that one configuration.
2. **Authorize the target.** A trigger fires only against the sessions it was
   configured for. The configuration names its target; a request cannot choose
   another one.
3. **Audit the admission.** The provenance above is recorded with the input.

### No person means no implicit approval

A triggered turn runs under the session's captured authority and permission
policy. When no person is present to answer, an action that would ask is denied
or returned as an identified input-required outcome, as the
[permission policy](./permissions.md) and headless execution define. A trigger
never widens authority, and a host SHOULD apply a narrower profile to externally
triggered work than to work a person started.

### Lifetime is bounded

- Every persistent trigger carries an expiry. A wake-up's horizon is bounded by
  the host, and an external configuration SHOULD expire unless renewed.
- Every external source carries a rate limit, and the host SHOULD cap
  triggered work per account.
- Deleting a session cancels its wake-ups and detaches its external
  configurations ([Components / session lifecycle](./components.md#session-lifecycle-and-deletion)).
- A person can see and revoke every trigger that targets their sessions.
  Revocation stops future firing; it does not silently cancel work already
  admitted, which follows the ordinary Stop control.

## Wake-ups and child tasks are different

A wake-up returns to the **same task** later; a child task does **more work
now**. A task that only needs to wait SHOULD request a wake-up rather than keep
a child running to hold a clock. A triggered turn MAY start child tasks within
its allowance; the two compose without overlapping.

## Not specified here

- Signature schemes, schedule expression dialects, and rate or expiry defaults.
  The contract names the behavior (drop on duplicate or excess, expire,
  revoke); hosts choose the values.
- Where an external trigger executes. A trigger received by a hosted service
  and one received by a local host follow the same rules.

## See also

- [Lifecycle events](./events.md) — triggered turns publish the same facts as
  any other turn.
- [Turn authority](./turn-authority.md) — clients learn which input a triggered
  turn serves the same way they learn it for any other.
