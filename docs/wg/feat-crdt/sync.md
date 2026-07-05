---
title: Sync
description: Multi-instance document replication — optimistic three-layer state, authority and rebase, presence — and the two-instance conformance contracts.
tags:
  - internal
  - wg
  - editor
  - collaboration
format: md
---

Sync replicates a document between editor instances. The reference
editor must support two instances editing one document concurrently.
This document specifies the replication model at the editor boundary;
transport (sockets, servers) is a host concern, and the conformance
contracts are stated over any transport — including an in-process
loopback.

## Model: optimistic, authority-ordered

Each instance maintains three layers over the document:

- **canonical** — the last authority-confirmed state;
- **speculative** — local changes sent to the authority but not yet
  acknowledged;
- **unsent** — local changes not yet sent.

The rendered working copy is always
`canonical + speculative + unsent`. One party (a server, or a
designated instance in a two-instance session) is the **authority**:
it defines the canonical order of operations. There is no peer-to-peer
merge in this model; convergence comes from everyone applying the
authority's order.

On receiving an authority update, an instance **rebases**: roll back
speculative and unsent layers, apply the authority's operations to
canonical, then re-apply speculative and unsent on top. Re-application
may be adjusted or dropped where the authority's state invalidates it
(a patch to a node that was remotely deleted drops; the session
continues).

## What travels

Sync transmits the [mutation vocabulary](https://github.com/gridaco/grida/blob/main/crates/grida_editor/docs/document.md) — the same
serializable operations history stores. Only **content** mutations
replicate. Authoring context and view state travel separately as
**presence** (ephemeral, latest-wins, never merged into the document):
peer selections, cursors, viewports.

Received remote operations dispatch with `remote` origin — applied
silently, never entering the local history stack, per the golden
[history spec](../feat-history/index.md). Local undo of an entry
whose target was remotely changed applies its inverse to whatever
state exists (last-writer-wins at the property level); conflict
*prevention* is out of scope by design.

## Session

Joining a session means: fetch canonical state (or verify the local
document matches the authority's version), then stream operations
bidirectionally. Leaving requires no ceremony beyond flushing unsent
operations or explicitly discarding them. Reconnection replays from
the last acknowledged sequence number — operations carry monotonic
per-sender sequence ids for exactly-once application.

## Contracts

- **SYNC-1** Convergence: two instances applying the same authority
  stream reach byte-equal documents, regardless of their local
  operation timing.
- **SYNC-2** Optimistic echo: a local edit renders immediately
  (before acknowledgment), and acknowledgment causes no observable
  state change when the authority accepted it unmodified.
- **SYNC-3** Rebase correctness: with instance A editing node X and
  instance B concurrently editing node Y, both instances converge to
  a state containing both edits.
- **SYNC-4** Conflict drop: if B deletes node X while A has an unsent
  patch to X, A's patch is dropped on rebase, A converges to the
  deletion, and A's session continues without error.
- **SYNC-5** History isolation under sync: throughout SYNC-2..4,
  each instance's undo stack contains only its own local entries
  (HISB-5 holds end-to-end).
- **SYNC-6** Presence is ephemeral: peer selection/cursor updates
  produce no document mutations, no history entries, and vanish when
  the peer leaves.
- **SYNC-7** Exactly-once: duplicated or re-ordered delivery of the
  same operation (by sequence id) applies once, in sequence order.
- **SYNC-8** The full contract suite passes over an in-process
  loopback transport with no network.
