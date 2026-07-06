---
title: Harness & Conformance
description: How every contract in this RFC is verified headlessly, the performance budgets for the hot paths, and the conformance milestones that define done.
tags:
  - internal
  - wg
  - editor
format: md
---

The RFC's doctrine is that every behavioral claim is verifiable
without a window or a human. This document specifies the harness that
makes that true, the performance budgets, and the milestones that
define "done" for the reference editor.

## The harness

A conformance test constructs a real editor instance (and, where
needed, a real render surface via the headless GPU path) and drives
it through the same boundaries production input uses:

- **commands** — dispatched by name with arguments;
- **synthetic surface events** — pointer/key/text/IME sequences with
  modifiers, addressed in screen space;
- **mutations** — applied directly where the test targets editor core;
- **sync operations** — injected through a loopback transport
  (SYNC-8);
- **time** — a controlled clock, so burst-framing dwells, gesture
  framing, and frame pacing are deterministic (no sleeps, no
  wall-clock flakiness).

Assertions run on three planes, strongest applicable plane preferred:

1. **document/editor state** — node properties, structure, selection,
   history stack shape (most contracts);
2. **scene/derived state** — what the engine was told to render:
   chrome present, panel subtree shape, layout results;
3. **pixels** — golden/reference images via the existing rendering
   test infrastructure, reserved for claims that are genuinely visual
   (chrome appearance, SURF-5).

## Contract discipline

Every numbered contract in this cluster (`ARCH-*`, `DOC-*`, `ED-*`,
`HISB-*`, `SYNC-*`, `SURF-*`, `TGT-*`, `TOOL-*`, `TRL-*`, `VEC-*`,
`MODE-*`,
`SNAP-*`, `MEAS-*`, `RUL-*`, `PXG-*`, `TG-*`, `PART-*`, `KEY-*`, `ROUTE-*`, `TRAV-*`,
`NUDGE-*`, `GRP-*`, `ALY-*`, `FLAT-*`, `OUTL-*`, `BOOL-*`, `ALIGN-*`, `MENU-*`,
`UI-*`, `WID-*`, `PROP-*`, `SHEET-*`, `HIER-*`,
`IO-*`, `IOX-*`, `SHELL-*`) maps to at least one conformance test
that cites its id. The suite is the spec's executable form: a contract without a
test is marked unverified in the suite report, and a test without a
contract is a candidate for either promotion (write the clause) or
deletion. Amending a contract requires amending its tests in the same
change.

## Performance budgets

Budgets are contracts, measured by the harness on defined reference
documents (a small document, and a large one at the engine's ~100k
node scale), on the reference desktop class of hardware:

- **PERF-1 (the hot path)** Color-slider preview, end to end —
  synthetic pointer-move on the picker → preview mutation → rendered
  frame submitted — sustains the display rate (≤16.6ms per preview,
  p95) on the small document with the edited node visible, and
  degrades gracefully (previews may coalesce, never queue unboundedly)
  on the large one.
- **PERF-2** Gesture echo: pointer-move during translate → updated
  frame ≤16.6ms p95 on the small document.
- **PERF-3** Hierarchy windowing: per-frame tree cost is a function
  of visible rows, demonstrated by equal frame cost for 1k-node and
  100k-node documents at equal visible-row counts (HIER-7).
- **PERF-4** Undo latency: undoing a single-property entry applies
  and renders within one frame budget on the small document.
- **PERF-5** Sync echo: a local edit renders locally without waiting
  on any acknowledgment (SYNC-2 measured: zero added frames).

Budgets are honest ceilings, not aspirations — a milestone does not
pass while its budgets fail.

## Conformance milestones

- **M1 — core.** Editor core with document, mutations, history, and
  commands: all `DOC-*`, `ED-*`, `HISB-*` pass with no renderer
  (ARCH-1).
- **M2 — canvas.** Surface gestures and chrome on a live view:
  `SURF-*`, `PART-*`, PERF-2/PERF-4. The overlay systems (`SNAP-*`,
  `MEAS-*`, `RUL-*`, `PXG-*`, `TG-*`) extend this milestone.
- **M3 — panels.** UI layer, widgets, properties, hierarchy:
  `UI-*`, `WID-*`, `PROP-*`, `HIER-*`, PERF-1/PERF-3, and the shell
  contracts. The structural commands (`GRP-*`, `ALY-*`, `FLAT-*`) land
  here alongside `BOOL-*`/`ALIGN-*`/`OUTL-*`.
- **M4 — the deliverable.** IO and sync: `IO-*`, `SYNC-*`, PERF-5 —
  two shell instances authoring one document concurrently, with
  import/export and cross-instance copy/paste demonstrated by the
  suite, not by hand.
