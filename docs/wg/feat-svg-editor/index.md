---
title: "SVG Editor (TS SDK) — Design and Research"
tags:
  - internal
  - svg
  - svg-editor
  - design
  - research
---

# SVG Editor (TS SDK) — Design and Research

Internal documentation for the TypeScript `@grida/svg-editor` SDK
(`packages/grida-svg-editor`). This directory collects both the
spec/upstream research that informs the editor and the in-flight
design notes for its typed in-memory element IR.

Not to be confused with the sibling `feat-svg/` directory, which
covers SVG support in the Rust/canvas renderer (parsing into the
canvas runtime, pattern handling, text import). That work and this
one share a substrate — the SVG spec — but live on opposite sides of
the import boundary: `feat-svg/` is about reading SVG into Grida's
scene graph; `feat-svg-editor/` is about editing SVG as SVG,
preserving the author's source on round-trip.

## Contents

### Spec and upstream research

- [`svg-element-model.md`](./svg-element-model.md) — spec-grounded
  reference for the SVG element surface a graphical editor IR must
  expose: per-element geometry, presentation attributes, local
  coordinate frames, in-place mutations that preserve byte
  round-trip, and cross-element constructs that resist editing.
- [`svg-transform-and-frame.md`](./svg-transform-and-frame.md) —
  enumerates which `transform=` shapes carry observably distinct
  information, to inform the IR's refuse-vs-normalize policy for
  rotation and pivot handling.
- [`usvg-tree-notes.md`](./usvg-tree-notes.md) — comparative read of
  resvg's `usvg` ("micro SVG") IR. Catalogues what `usvg` normalizes
  away (CSS cascade, inheritance, `use` expansion, etc.) and which
  of those discards an editor IR must refuse in order to preserve
  the author's source.
- [`svg-editor-intent-matrix.md`](./svg-editor-intent-matrix.md) —
  current-state inventory (no design content) of what the v0
  implementation does today for each public intent × SVG element
  cell. Input to the IR redesign.

### Element IR design (in flight)

- [`element-ir.md`](./element-ir.md) — proposal for a typed
  in-memory element IR that replaces the current per-tag
  `switch`-driven intent dispatch with capability-gated per-element
  records, centralising rotation-pivot tracking, refusal taxonomy,
  and round-trip invariants.
- [`element-ir-migration.md`](./element-ir-migration.md) — sketch
  (not a task list) mapping the current `@grida/svg-editor` source
  onto the proposed IR: what survives verbatim, what survives behind
  an adapter, what gets deleted, and a low-risk phasing.

Status: pre-implementation; design under review.
