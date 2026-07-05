---
title: Editor Core
description: The editor instance — construction, dispatch, observation granularity, and the query surface panels are built on.
tags:
  - internal
  - wg
  - editor
format: md
---

The **editor** is the instance that owns the working copy and all
state domains, applies mutations, records history, exchanges sync
operations, and is observed by every panel and view. Its state-domain
decomposition (content, authoring context, view, interaction,
collaboration) and their lifecycle contracts are specified in the
golden [state model](../../../docs/wg/canvas/state.md); this document specifies
the instance itself.

## Lifecycle

```
create(engine) → load(document) → [edit: dispatch/observe/undo/sync]*
              → unload → destroy
```

Loading replaces the working copy and resets authoring context,
history, and sync session state. An editor with no document loaded
accepts no mutations and answers queries with empty results — never
undefined behavior.

## Dispatch

Dispatch is the single entry for change, per
[document.md](./document.md). A dispatch names:

- the **mutation batch** (or a command that expands to one);
- the **origin** — local user, remote peer, or agent;
- the **recording mode** — `record` (default; produces a history
  entry per the golden [history semantics](../../../docs/wg/feat-history/index.md)),
  `silent` (applies without recording; used for previews and remote
  application), or an open **transaction** (gesture framing).

Dispatch is synchronous and atomic from the caller's view: when it
returns, the document, the change summary, history, and observer
notification are all consistent.

## Observation

Everything above editor core is a subscriber. The observation contract
is granularity, because panel performance depends on it:

- Observers subscribe with a **selector** — a projection of editor
  state (specific properties of specific nodes, the selection set, a
  subtree's structure).
- An observer is notified only when its selection's value actually
  changed, as determined from change summaries — not on every
  dispatch.
- Notification order is deterministic, and observers see the
  post-dispatch state only (no intermediate states of a batch).

This is what makes the "rebuild, don't react" UI doctrine viable: a
properties section subscribed to `{opacity, blend_mode}` of the
selection rebuilds only when those change.

## Damage

Beside push observation, the editor accrues a **damage ledger** for
the presentation host: every applied batch's change summary — any
origin, any recording mode, including silent previews, undo/redo, and
gesture-abort rollbacks — merges into the ledger until the host
drains it. The ledger is pull, not push: the host reconciles pixels
at its own frame cadence ([frame.md](./frame.md)), and a headless
editor that nobody drains simply accumulates. Observers answer "who
needs to react"; the ledger answers "what has not been painted yet".

## Queries

The editor exposes a read-only query surface sufficient for panels
and tools, answered against current state: node property reads, the
selection and its shared property values (the mixed-value model in
[properties.md](./properties.md)), subtree listings in document order,
geometry queries (bounds), and hit-tests delegated to the engine.
Queries never mutate and never observe — they are pull, subscription
is push.

## Commands

The command registry per the golden [input & commands
spec](../../../docs/wg/canvas/input.md) lives on the editor: commands are
enumerable, dispatchable by name, and expand to mutation batches
and/or state-domain changes. The shell binds keys to commands; panels
invoke commands; tests drive commands. One vocabulary.

## Contracts

- **ED-1** Dispatch is atomic: an observer notified after a dispatch
  sees history, document, and authoring context already consistent
  with that dispatch.
- **ED-2** A selector-subscribed observer is not notified by a
  dispatch whose change summary does not intersect its selection.
- **ED-3** Origins are honored end-to-end: a `remote`-origin dispatch
  never produces a local history entry; a `local` `record` dispatch
  always produces exactly one.
- **ED-4** Every command invocation is equivalent to some sequence of
  dispatches; replaying that sequence reproduces the same state.
- **ED-5** Queries are pure: any sequence of queries between two
  dispatches returns identical results, and issuing queries produces
  no notifications.
- **ED-6** Create → load → edit → unload → load the same document
  again yields a working copy equal to the first load (no state leaks
  across loads).
- **ED-7** Selection integrity: the selection only ever holds ids that
  exist in the document. Applying any batch that removes nodes (local
  delete, remote sync, undo of an insert) drops those ids from the
  selection in the same dispatch; setting a selection drops unknown
  ids on entry. A selection-driven batch built immediately after can
  never be rejected for a stale id.
- **ED-8** Damage completeness: every applied batch accrues its change
  summary into the damage ledger — regardless of origin and recording
  mode — and draining the ledger returns everything accrued since the
  previous drain, exactly once (a second drain with no intervening
  applies is empty). Loading a document accrues structural damage.
