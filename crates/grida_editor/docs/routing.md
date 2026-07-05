---
title: Input Routing
description: How one key means different things per editor state — chain dispatch over a command registry, claims vs dispatch, capture layers, and the intent-matrix discipline.
tags:
  - internal
  - wg
  - editor
format: md
---

Arrow keys nudge vertices in vector edit, nudge nodes in selection,
and pan the camera when nothing is selected. Enter enters a text
session, descends the tree, or commits — depending on where you are.
Escape means five different things. A single key→action table cannot
express an editor, and the failure mode of not having a system is
well known: per-key handlers scattered through the view layer, each
carrying its own copy of the state checks, no way to know which
handler wins, and no way to test the whole surface. This document
specifies the routing system that keeps state-dependent meaning
clean, predictable, and enumerable.

## The model

Four primitives:

1. **Command registry** — id → handler. A handler *reads editor
   state and decides for itself* whether it applies, returning
   **consumed** or **declined**. A declined handler must have no
   effect. Guards live in handlers, not in a declarative predicate
   language: the handler already speaks the state vocabulary, and a
   parallel `when`-clause DSL would duplicate that vocabulary and
   drift from it. (A predicate DSL is a named possible extension,
   not part of this spec.)
2. **Binding table** — chord (with its meaningful-modifier mask,
   [keybindings](./keybindings.md)) → an **ordered chain** of
   command ids. The table is data: one place, enumerable, diffable.
3. **Chain dispatch** — on key input: normalize the chord, look up
   its chain, invoke commands in declared order; the first
   *consumed* wins and the rest are skipped. If every command
   declines, the input falls through to the host (browser/OS)
   default. Dispatch is O(1) to the chain; there is no scanning of
   handlers that didn't bind the chord.
4. **Claims vs dispatch** — `claims(input)` answers "is this chord
   advertised?" *without running any handler*. The shell uses it to
   suppress host defaults for advertised chords even when every
   handler declines — so a chord the editor owns never half-leaks to
   the host based on transient state.

## Capture layers

The chain dispatch sits at the *bottom* of the golden input spec's
priority ladder; the layers above it capture input before the table
is consulted:

1. **Active edit mode** ([edit-mode](../../../docs/wg/canvas/edit-mode.md)): a content
   mode or paint session re-resolves keys first — a text session
   captures printable input, editing keys, and IME entirely (the
   table never sees a keystroke meant for a caret); other modes
   capture their own key vocabulary and let the rest fall through.
2. **Active gesture**: modifier changes reconfigure the gesture;
   cancel keys abort it.
3. **Widget focus**: a focused panel widget receives keys first
   (UI-3); the table is suppressed except rows explicitly marked
   legal under form focus. An open popover (the
   [context menu](./context-menu.md)) is this layer's *modal* form:
   it grabs pointer and keyboard together — its navigation
   vocabulary and Escape resolve against it, an outside press
   dismisses and is swallowed, and everything else is suppressed —
   until it closes.
4. **Attention gate**: keys route to the editor only while it is
   *attended* — keyboard focus within it or pointer over its canvas.
   Exception: with a gesture in flight, Escape routes to the gesture
   regardless of attention, because an in-flight gesture *is* the
   attention.

## Overloading patterns

Two idioms cover every "same key, different meaning" case:

- **Alternative chain** — mutually exclusive meanings bind as an
  ordered chain, and state picks the survivor. Enter binds
  `[enter-content-edit, select-children]`: the first declines unless
  the selection is a single editable node, so Enter naturally
  descends otherwise ([traversal](../../../docs/wg/canvas/traversal.md)). Delete binds
  `[delete-sub-selection, delete-selection]`: inside vector edit the
  first consumes; outside it declines and the node delete runs.
- **Ladder command** — strictly ordered rungs where each press takes
  exactly one step bind as a *single* command owning the ladder.
  Escape is the canonical ladder: (in vector edit) disconnect →
  revert tool → exit mode; (outside) revert tool → deselect. The
  ladder owns its ordering in one place; expressing it as a chain
  would smear the ordering across handler guards.

The choice is semantic: alternatives are *exclusive by state*;
ladder rungs are *sequential by repetition*.

## The intent matrix

The routing system's test artifact is the **intent matrix**: rows
are inputs (keys and pointer verbs), columns are editor states
(selection empty / node selection / each content-edit mode / gesture
in flight / widget focus), and each cell names the resolved meaning
or `—`. The matrix is not documentation that hopes to stay true: it
is **derivable** — every cell must be reproducible headlessly by
driving the editor into the state, injecting the input, and
asserting the outcome. A cell that cannot be tested that way is a
spec smell (the meaning is hiding outside the routing system).
The matrix for this editor's core keys lives with the conformance
suite; the sheet ([keybindings](./keybindings.md)) plus the registry
generate its skeleton.

## What this design rejects

- **Handler sprawl in the view layer** — key handling attached to
  view components, each with inline state checks. Resolution order
  becomes source-line order; the surface is untestable as a whole.
  (The production web editor exhibits exactly this — a thousand-line
  hotkey component with over a hundred independent hooks — and is
  the cautionary grounding for this spec.)
- **Runtime ambiguity** — two bindings matching one chord+mask is a
  table error caught by enumeration, never a priority race.
- **Timing-based meaning** — no double-press or long-press semantics
  in the core vocabulary (multi-tap exists only as an explicitly
  named exception, e.g. the opacity double-zero, and is modeled as
  its own stateful command, not as a binding-table feature).

## Contracts

- **ROUTE-1** Determinism: for a fixed editor state and input chord,
  the resolved command is unique and stable — binding order is total.
- **ROUTE-2** Declined means untouched: a handler that declines has
  made no observable state change (checked by state hash around the
  dispatch).
- **ROUTE-3** Claims purity: `claims` runs no handler; an advertised
  chord suppresses the host default even when all its handlers
  decline.
- **ROUTE-4** Capture precedence: with a text session active, no
  table command fires for printable input; with a gesture in flight,
  Escape aborts the gesture and consumes.
- **ROUTE-5** Ladders step once: each Escape press takes exactly one
  rung; N rungs need N presses.
- **ROUTE-6** The matrix is executable: every documented
  input×state cell has a conformance test that reproduces it
  headlessly.
