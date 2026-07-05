---
title: CRDT & Sync
description: Realtime multi-instance editing of one Grida document — durable identity, optimistic replication with authority order, and convergence.
tags:
  - internal
  - wg
  - canvas
format: md
---

Realtime, multi-instance editing of a single Grida document: how two
or more instances edit concurrently and **converge**. This is the deep
study the [canvas spec](../canvas/) relies on but does not restate —
replication is technical enough to warrant its own pedantic treatment.

## Documents

- **[Durable node identity](./id.md)** — the identity semantics a node
  must have for a mutation authored on one instance to mean the same
  thing on another.
- **[Sync](./sync.md)** — the replication model: the three state layers
  (canonical, speculative, unsent), rebase on authority order, session
  join/leave, presence, and exactly-once delivery. This is what makes
  optimistic local editing converge with remote authority.

## Relationship to the editor

History is per-user and local ([feat-history](../feat-history/)); sync
is how remote changes interact with that local state without entering
the local undo stack. The canvas spec's io and surface contracts
assume this convergence model but do not define it — it lives here.
