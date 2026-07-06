---
title: Devtools (RFD)
description: Request for discussion — an inspector for the engine-hosted editor: one tree view over scene content and the editor's own UI, with pick, highlight, and live values.
tags:
  - internal
  - wg
  - editor
format: md
---

**Status: RFD.** This document argues a need and sketches a shape;
it carries no contracts yet. Contracts land when the shape is agreed
and it graduates to a spec.

## The need

A browser-hosted editor gets an inspector for free: the DOM
inspector shows every element, its computed style, its boxes, and
lets you pick an element by clicking it. The engine-hosted editor
gets **nothing** — and it has _more_ to inspect, not less: the
document scene graph, the HUD chrome, and — because the editor's own
panels are engine scene subtrees ([ui](./ui.md)) — the entire UI.
Today, debugging a widget layout or a stray HUD prim means printf
and pixel-guessing. The headless harness proves contracts but does
not let a human _explore_ a live instance.

The payoff of ui-as-engine-nodes cuts both ways here: because
content and UI share one substrate, **one inspector serves both** —
the same tree view walks a document container and a properties-panel
row. Building it is also the cheapest adversarial test of the
observation APIs: an inspector is a panel that observes everything.

## The shape

A **devtools surface** with four capabilities:

1. **Tree view** — the live node tree, switchable between roots:
   the document scene, the UI widget tree, the HUD draw list. Rows
   show id, kind, name, and liveness flags (active, locked, damage
   state).
2. **Detail view** — the selected node's properties, computed
   values (world bounds, layout results, resolved paint), and
   widget-layer state where applicable (focus, retained state,
   bindings).
3. **Pick and highlight** — the two-way bridge browsers taught
   everyone: a pick mode where clicking anything on the surface
   selects its row (bypassing normal targeting — chrome and UI are
   pickable), and hover-highlighting where hovering a row outlines
   the node on the surface.
4. **Live updates** — the view follows the instance through the same
   observation contract panels use (ED-2 granularity), never a
   privileged backdoor: if the inspector can see it, the observation
   API exposes it, which keeps the inspector honest and the API
   complete.

## Form factor

Three candidate embodiments, not mutually exclusive over time:

- **In-process overlay panel** — a fourth region in the shell,
  toggled by a debug binding. Cheapest; dogfoods the widget layer;
  recommended starting point.
- **Second window** — same process, dedicated OS window. Better
  ergonomics on multi-monitor; requires multi-window shell support
  that nothing else needs yet.
- **Remote** — serve the inspection data over a protocol to an
  external viewer, the way browser devtools and React devtools work.
  The editor already speaks a wire protocol for document sync
  ([sync](../../../docs/wg/feat-crdt/sync.md)); a devtools channel is the natural growth
  path, and it is the only form that can inspect a headless or
  embedded instance.

Recommendation: start with the overlay panel backed by a **clean
read-model** (the data the tree/detail views consume), designed so
the same read-model can later serialize over the remote channel.
The read-model, not the panel, is the durable investment.

Additionally, a **text dump mode** — the read-model serialized to
text on demand — costs almost nothing once the read-model exists and
gives CI failures and agent-driven debugging a way to "see" an
instance without any UI.

## Requirements sketch

- **R1 — free when closed**: no observation subscriptions, no
  memory growth, no per-frame cost while the inspector is not open.
- **R2 — observation only**: reads go through the public
  query/observation surface; the inspector adds no privileged state
  access.
- **R3 — pick everything**: pick mode reaches content, HUD chrome,
  and UI widgets — the three trees the normal targeting ladder
  deliberately separates.
- **R4 — mutation is ordinary**: editing a value from the detail
  view dispatches the same mutations as the properties panel; there
  is no devtools-only write path.
- **R5 — headless dump**: the read-model serializes without a
  window.

## Open questions

- Damage visualization: overlay the [frame](./frame.md) ledger's
  dirty regions per frame — in scope for v1 or a later channel?
- Performance counters: surface the [harness](./harness.md) budgets
  (frame cost, hit-test cost) live in the detail view?
- How much widget-layer internal state (retained state, focus path)
  is _public observation_ vs implementation detail the inspector
  would freeze by exposing?
