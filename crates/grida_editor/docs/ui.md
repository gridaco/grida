---
title: UI System
description: The editor's own widget system — engine-rendered, single-surface, deliberately dumb — and why an external UI library was rejected.
tags:
  - internal
  - wg
  - editor
format: md
---

The editor's panels need a UI system, and the engine does not have
one. This RFC decides: **the editor builds its own minimal widget
layer on top of the engine** ("ui-as-engine-nodes"), rather than
adopting an external UI library. The decision was adversarially
debated; the argument and its reversal conditions are recorded here.

## The decision

Widgets are engine scene subtrees. A panel is a flex container of
rows; a row is containers, text spans, and rectangles; widget visuals
are painted by the same renderer, laid out by the same layout engine,
and hit by the same chrome-priority hit-region mechanism as canvas
overlay chrome. The UI layer adds only what the engine genuinely
lacks:

- **widget identity** — a stable key per widget instance, so retained
  state survives rebuilds;
- **widget state** — per-identity retained state (drag anchor, edit
  buffer, expansion, scroll offset);
- **focus** — a single focused widget, a tab order, and keyboard
  routing to the focused widget;
- **scrolling** — scroll containers with clipping and wheel routing;
- **binding** — the preview/commit value contract that connects a
  widget to a document property (see below).

## Why build, not adopt

1. **The hard parts already exist.** A UI toolkit is layout + text +
   painting + input + hit-testing + text editing. The engine ships
   all six, including a from-scratch text-editing subsystem — the
   single hardest widget, and the precedent that owning the hard path
   is this project's way.
2. **One surface, zero integration tax.** A window has one swapchain.
   UI drawn as engine nodes rides the existing render pipeline,
   caching, and invalidation for free. Any external toolkit brings a
   second renderer, a second font/text stack, a second layout system,
   graphics-state reconciliation around every foreign draw, and an
   input-arbitration layer — a permanent tax paid for widgets whose
   looks explicitly do not matter here.
3. **One testing paradigm.** Widgets driven by the same normalized
   event vocabulary as the canvas are testable in the same headless
   harness, with assertions against the same scene and document state.
   An external toolkit forces a second, foreign testing model for
   exactly the layer whose job is to *be* the spec harness.
4. **The endgame is the point.** Grida aims to be a UI engine. The
   editor's own panels are the cheapest adversarial test of the node
   schema ("can it express a settings panel?"), and every hour spent
   here compounds into the product. Building the harness on a
   competitor's toolkit defers that work; it does not save it.

**Rejected alternative:** adopting an immediate-mode library (the
strongest candidate was evaluated in depth). It wins time-to-first-
panel (~2–3 weeks to a working panel set) and has proven virtualized
lists; it loses on double text stacks, foreign-renderer state
reconciliation, a second testing paradigm, IME weakness, and — 
decisively — on the mission: for a project that intends to be a UI
engine, external adoption is deferred work, not saved work.

## The dumbness doctrine

The UI layer is a **widget layer, not a framework**. This is a hard
scope gate, imported from the losing side of the debate:

- **Rebuild, don't react.** On relevant state change, the affected
  panel subtree is rebuilt and swapped. No diffing, no reactive
  graph, no subscription framework. Rebuild granularity is the
  panel section, bounded by the observation contract in
  [editor.md](./editor.md).
- **No styling system.** Widgets have fixed, hardcoded looks.
- **Deferred affordances are named:** animation, accessibility, and
  rich theming are out of scope until the editor spec itself is
  served. (Popovers began on this list and graduated when the
  context menu shipped the anchored overlay; every floating surface
  now rides that one primitive — WID-8 in
  [widgets.md](./widgets.md).)

## Binding: preview and commit

Every value widget binds to a target through a two-phase contract
(the widget-side face of the intent phases in the state model):

- during interaction (slider drag, scrubbing a numeric label), the
  widget emits **preview** values — applied to the document for live
  rendering but never recorded;
- on release/confirm it emits exactly one **commit** — the only event
  that produces a history entry;
- on cancel it emits **revert** — the pre-interaction value is
  restored and nothing is recorded.

## Risk register and reversal conditions

Two pieces are genuinely untrodden and carry the estimate risk:
multi-input **focus/IME** (the text-editing subsystem has served one
canvas node at a time; N focusable inputs with IME-rect tracking is
new), and **scroll-with-clipping hit-testing**. Both are built first,
time-boxed. The decision reverses — the widget layer is swapped for an
external library behind the same binding contract — if either spike
exceeds twice its box, or if an external deadline makes the harness
critical-path. The panel specs ([properties](./properties.md),
[hierarchy](../../../docs/wg/canvas/hierarchy.md)) are written against the binding and
command contracts, not against this widget layer, precisely so the
verdict stays reversible.

## Contracts

- **UI-1** A widget tree is expressible entirely in the engine's node
  schema; rendering a panel requires no paint path that canvas
  content could not use.
- **UI-2** Widget retained state survives a rebuild of its subtree:
  after any rebuild, a widget with the same identity has the same
  state (focus, edit buffer, scroll offset, expansion).
- **UI-3** Exactly one widget has keyboard focus at a time; tab order
  is deterministic; keyboard events reach only the focused widget
  (after command-routing priority is honored).
- **UI-4** A value widget emits zero or more previews followed by
  exactly one commit or one revert, never interleaved, never more
  than one commit per interaction.
- **UI-5** Pointer input over UI regions never reaches the canvas
  surface; pointer input outside UI regions never activates a widget.
- **UI-6** A scroll container clips both painting and hit-testing:
  a widget scrolled out of view can be neither seen nor clicked.
- **UI-7** All widget behaviors are drivable headlessly through the
  normalized event vocabulary — no widget requires a real window.
