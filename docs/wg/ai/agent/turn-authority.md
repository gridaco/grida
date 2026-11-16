---
title: Turn Authority
description: The host states which accepted input each turn serves and what became of it; a client renders those facts and never reconstructs them from its own pending view. The authority direction, the identities and transitions a client reads, and how optimistic presentation reconciles.
keywords:
  [
    agent-system,
    turn,
    turn-lifecycle,
    authority,
    queue,
    submission,
    disposition,
    optimistic-presentation,
    reconciliation,
    contract,
  ]
format: md
tags:
  - internal
  - wg
  - agent-system
---

# Turn Authority

Accepted input waits in a queue, is claimed by a turn, is steered into a running
turn, or is withdrawn. Only the session owner decides which of these happened.
A client still has to render the result: move the claimed request into the
transcript, attach to its output, and stop showing it as pending. This page
fixes how the client learns those facts:

> **The host states what happened; the client renders it.** A client MUST NOT
> infer which accepted input a turn serves, or what became of an input, from
> its own pending view, from queue order, or from a change in activity alone.
> The fact travels from the session owner, keyed by identity.

[Components](./components.md#drivers-and-controls) owns input identity,
conditional claims, supersession, and dispositions. [Master](./master.md#input-during-work-and-stopping)
owns queue policy, steering, Pause, and Stop. This page owns only the direction
of authority between the session owner and every client that presents it.

The keywords **MUST**, **MUST NOT**, **SHOULD**, **SHOULD NOT**, and **MAY** are
used as in [RFC 2119](https://datatracker.ietf.org/doc/html/rfc2119).

## Why inference fails

An activity signal says _that_ a turn is running. It does not say _which_ input
the turn serves. A client that keeps a local pending list for instant feedback
can be tempted to treat an idle-to-working edge as "the head of my list started."

That guess races. Two queued inputs can be claimed back to back before the
client's pending list catches up, a queued input can be edited into a new
identity, another client can reorder or withdraw it, and steering can deliver an
input into a running turn without starting a new one. In each case the head of
the local list is not the input the owner selected. A client that promotes it
shows a request above an answer it did not produce, and any later fork, edit,
or history position keyed on that identity inherits the error.

Lengthening a settle delay, polling the queue and diffing it, or keeping a
client-private queue all relocate the same inference. A host with no person
present has no local list to infer from. The owner already knows the answer at
the moment it decides, so it reports that answer.

## The contract

### Authority direction

- The session owner is the only component that decides which accepted input a
  turn claims, which input steering delivers, and which input is withdrawn or
  superseded.
- The owner MUST report each such decision with the identity of the input it
  concerns and, for a claim or steering delivery, the identity of the turn.
- A client MUST treat that report as the source of truth for what it shows as
  running, delivered, or settled.

### What a client reads

A conforming owner exposes, for each accepted input, its current disposition:
queued, claimed by an identified turn, delivered into an identified running
turn, superseded by an identified replacement, or withdrawn. For each turn it
exposes the input that started it, its activity, and its settled outcome
(finished, stopped, failed, or interrupted with its recorded cause).

Activity remains useful on its own: it decides whether to offer Stop or Send.
It is never used to decide which input moved.

The owner MAY deliver these facts as incremental updates, as a snapshot a client
reads on demand, or both. Delivery is volatile; the session record is
authoritative. After reconnecting, a client reads the authoritative snapshot
before it presents or acts on any of these facts.

### Optimistic presentation

A client MAY show an input as pending between submission and the owner's
receipt so the interface feels immediate. Optimistic presentation is reconciled
against reported identities; it never produces them.

- A client recognizes its own submission by the identity the owner returned in
  the acceptance receipt.
- When the owner reports a claim, the client moves exactly that input into the
  transcript and removes it from its pending view in the same step.
- When the owner reports supersession or withdrawal, the client follows the
  reported identities rather than reapplying its own edit.
- A submission the owner refused stays as an unsent draft; it never appears in
  the transcript.

## Invariants

- Every claim, steering delivery, supersession, and withdrawal is reported with
  the identity of the input it concerns.
- Every turn names the input that started it, and its settled outcome is keyed
  on the turn identity.
- No client derives which input moved from queue order or an activity edge.
- Optimistic presentation is reconciled against reported identities and is
  never the source of a transcript entry.
- Every client — an interactive pane, a headless runner, an external protocol
  client — reads the same facts and needs no other client's logic to render
  them correctly.

## Not specified here

- **Transport and packetization.** Whether facts ride on a session update
  stream, a snapshot read, or both is the host's choice.
- **Whether a client keeps optimistic state at all.** A headless client may
  submit and then read only reported facts.
- **Queue policy.** Ordering, coalescing, and steering eligibility belong to the
  [master](./master.md#input-during-work-and-stopping).

## See also

- [Lifecycle events](./events.md) — background attention facts that follow the
  same authority direction.
- [Components / drivers and controls](./components.md#drivers-and-controls) —
  input identity, claims, and dispositions.
