---
title: History
description: The undo/redo backbone — entries as data, transactions, gesture framing, burst framing, origin taxonomy, and what history must never contain.
tags:
  - internal
  - wg
  - editor
format: md
---

History is the editor's most load-bearing subsystem: every editing
feature ultimately routes through it, and a wrong history model is
nearly impossible to retrofit. This document specifies undo/redo
semantics as a contract. It intentionally over-specifies relative to
the minimum a demo needs — the semantics below are the ones users
silently rely on, and each has been the site of real bugs when
violated.

## Vocabulary

- **Entry** — one undoable step as the user perceives it. The unit of
  the undo stack.
- **Transaction** — a grouping construct that collects changes into a
  single entry. Transactions nest; a child transaction folds into its
  parent on commit, and only a top-level commit produces an entry.
- **Preview** — a tentative change that renders live but has not
  committed. At most one preview is active; setting a new one replaces
  (reverts) the previous. Discarding a preview leaves no history
  trace; committing it produces exactly one entry.
- **Origin** — who caused a change: the **local user**, a **remote
  peer**, or an **agent**. Every entry carries its origin.
- **Stack** — a linear pair of past and future entry lists, bounded in
  depth (oldest entries are evicted, not an error).

## The core contract

### 1. Entries are data, not behavior

An entry is a serializable, inspectable description of a change and
its inverse — never a captured function or closure. This is the single
most important requirement of the model, and it is what a re-designed
history must get right:

- **Inspectable** — tooling can display what an entry changed without
  executing it.
- **Serializable** — history can be persisted, restored after a crash,
  and transported across a process or language boundary. An engine on
  the far side of an FFI or wire boundary cannot hold host closures.
- **Reconcilable** — a sync layer can reason about an entry's
  footprint (which nodes, which fields) to detect conflicts with
  remote changes.

An implementation may cache derived state for performance, but the
authoritative form of every entry is data.

### 2. One gesture, one entry

An interactive gesture (drag, resize, rotate, paint) is framed
explicitly: **begin** opens a transaction and snapshots the pre-state;
intermediate motion applies **silently** (rendered, not recorded);
**commit** closes the transaction into one entry; **abort** restores
the pre-state and leaves no trace. A sixty-frame drag is one undo
step. Abort after abort must be idempotent.

### 3. Rapid repeats are framed, never merged

A committed entry is immutable: the stack never merges, rewrites, or
absorbs entries after the fact. Where a burst of discrete edits should
read as **one** step (typing a value, repeated nudges), that is
achieved the same way a gesture is — by *framing*: the interaction
layer keeps a transaction open across the burst and commits it on a
boundary (a quiet-period dwell, a key change, focus loss, a mode
change). The entry's endpoints (first pre-state, last post-state) fall
out of the framing; nothing intermediate is accumulated.

Stack-side merging — matching committed entries by an edit-kind key
inside a time window — is explicitly rejected. It rewrites history
behind the user's back (undo granularity becomes unpredictable: steps
the user performed separately silently vanish), and it demands a
second inverse-composition mechanism that framing already provides at
commit time. Kind-keyed merging is also unsound unless the key
carries full target identity: merging two same-kind entries that
touch different nodes yields an entry whose undo restores neither
endpoint.

### 4. Undo restores the authoring context

An entry captures the authoring context (selection, active scene,
content-edit mode) together with the content change, and undo/redo
restores both. Undoing a delete restores what was selected; redoing it
re-restores what the redo state selected. View state (camera) is never
captured — see the [State Model](../canvas/state.md).

### 5. Only local-origin entries enter the local stack

Remote-peer and agent changes apply to the document without entering
the local user's undo stack. Undo is per-user: each collaborator can
undo only their own work. There is no distributed or global undo. A
consequence the model must tolerate: undoing a local entry may apply
to a document that remote changes have since modified — the entry's
inverse applies to whatever state exists, and conflict handling is the
sync layer's concern, not history's. When an inverse cannot apply at
all (its target no longer exists), the entry is removed from the stack
and the failure is surfaced; application is atomic (§8), and a stale
entry must never be able to crash the editor.

### 6. The timeline is linear

Committing a new entry clears the redo (future) list. History is not a
tree; branching timelines are out of scope by design — they do not
match the user's mental model and they multiply every other contract's
complexity.

### 7. Nested editing contexts commit atomically

A sub-editor with its own fine-grained history (text editing is the
canonical case: per-keystroke undo *inside* the session) is a nested
context. While active, undo/redo route to the nested context. On exit,
the entire session commits as **one** entry in the document history —
or, on cancel, as none. The nested context's fine-grained steps never
leak into the document stack.

### 8. Applying an entry may await readiness

Undo/redo may need subsystems to be ready before an entry can apply
(a resource re-registered, an external structure rebuilt). The model
accommodates deferred application: undo is allowed to be asynchronous,
but is atomic — it either fully applies or reports failure without
partial effect.

## Exclusions

The following never enter history, under any implementation: camera
and viewport state, hover, active tool, in-flight gesture state,
presence and collaboration ephemera, and configuration toggles.
History records what the user did to the *document*, not what the user
did with the *editor*.
