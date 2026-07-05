---
title: History (Binding)
description: How the reference editor realizes the golden history semantics — entries as inverse mutation pairs — and the conformance contracts.
tags:
  - internal
  - wg
  - editor
format: md
---

The normative history semantics — entries as data, gesture framing,
coalescing, origin rules, exclusions, linearity, nested contexts —
are the golden [history spec](../../../docs/wg/feat-history/index.md). This
document binds that spec into the system: what an entry concretely
is, given the [mutation vocabulary](./document.md), and the
conformance contracts the harness enforces.

## The entry model

A history entry is a pair of mutation batches plus context:

```text
entry {
  redo:    mutation batch        // applies the change
  undo:    mutation batch        // the inverse (DOC-2)
  context: authoring context     // selection, active scene, edit mode
           (before, after)
  origin:  local | remote | agent
  label:   step name             // e.g. "translate" — display only
}
```

`label` names the step for undo affordances ("Undo translate"). It
has **no behavioral meaning**: it never keys merging, matching, or any
stack decision (golden §3 — committed entries are immutable).

Because mutations are invertible and serializable data (DOC-2,
DOC-3), an entry needs no captured behavior: undo applies the `undo`
batch (silently — an undo is not itself recorded) and restores the
`before` context; redo applies `redo` and restores `after`.

## Framing, concretely

- A **gesture transaction** (begin → silent previews → commit/abort)
  produces at most one entry whose `redo` is computed from the
  pre-state and post-state endpoints — not the concatenation of every
  intermediate preview. Endpoint minimality is the batch coalescer's
  job at commit time (patches to the same node/field collapse), which
  operates strictly _inside_ one entry.
- An open gesture can **roll back to a checkpoint** without closing:
  the frame applies the inverses of the previews past the mark and
  drops them, so a live structural toggle inside one gesture —
  clone-on-translate's modifier OFF edge
  ([translate.md](../../../docs/wg/canvas/translate.md), `TRL-5`) — commits an entry that
  never carried the abandoned structure.
- **Committed entries are immutable.** The stack never merges them —
  no kind keys, no quiet windows, no post-hoc rewriting (golden §3).
  Two drags are two steps; two slider scrubs are two steps.
- Where a **burst** should read as one step (repeated arrow nudges),
  the interaction layer frames it: the gesture stays open across the
  burst and commits on a dwell/boundary. Same machinery, no second
  mechanism. (See [nudge.md](../../../docs/wg/canvas/nudge.md).)
- The widget **preview/commit** contract (UI-4) maps onto this
  directly: previews are `silent`, the commit is the one `record`.

## Known deviation being corrected

The production web editor commits some slider interactions per frame,
producing many entries per drag. That behavior is a defect relative to
the golden spec, not a precedent; the reference editor must satisfy
HISB-2 from day one.

## Contracts

- **HISB-1** Undo/redo round-trip: for any recorded entry, undo then
  redo restores document _and_ authoring context to byte-equal state
  (per DOC-2 equality plus context equality).
- **HISB-2** One interaction, one entry: a scripted slider drag of N
  preview steps plus one commit yields exactly one history entry;
  undo restores the pre-drag value in one step.
- **HISB-3** Committed entries are immutable: K committed
  interactions yield K entries regardless of label or timing, and
  each undo reverts exactly one. A burst that should read as one step
  is framed (the transaction stays open across it) — the stack never
  merges entries after commit.
- **HISB-4** Abort leaves no trace: begin → previews → abort restores
  the pre-gesture state and history length is unchanged; a subsequent
  undo undoes the entry _before_ the gesture.
- **HISB-5** Origin isolation: interleaving remote-origin dispatches
  between local entries changes neither the local stack's length nor
  what each local undo restores of the local change.
- **HISB-6** Entries survive serialization: persisting the stack,
  restarting the editor with the same document state, and undoing
  produces the same results as undoing without the restart.
- **HISB-7** Depth bound: exceeding the configured depth evicts
  oldest entries only; undo remains consistent for all retained
  entries.
- **HISB-8** Nested context atomicity: a text-editing session with M
  internal edits commits as exactly one document entry (or zero on
  cancel), and the session's internal steps are unreachable from the
  document stack.
- **HISB-9** Tolerant application: undoing/redoing an entry whose
  batch no longer applies (e.g. its target was removed by a remote
  change) leaves the document unchanged (mutation application is
  atomic, DOC-4), removes the entry from the stack, surfaces the
  failure, and never panics; the next undo/redo targets the adjacent
  entry.
