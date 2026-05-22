---
title: "SVG Editor (TS SDK) — Design"
description: "Index of design notes for the @grida/svg-editor TypeScript SDK — element IR proposal, hit-test architecture, transform pipeline critique, Policy Class glossary."
keywords:
  - svg
  - svg-editor
  - design
  - sdk
  - ir
tags:
  - internal
  - svg
  - wg
format: md
---

# SVG Editor (TS SDK) — Design

In-flight design notes for the TypeScript `@grida/svg-editor` SDK
(`packages/grida-svg-editor`). This directory holds **grounding,
research, design proposals, and deep thoughts** — the IR proposal,
the current-state inventory that feeds it, and the v2 hit-test
architecture. Plans, migration sketches, and shipped-behavior
contracts live next to the package itself, not here.

Not to be confused with the sibling `feat-svg/` directory, which
covers SVG support in the Rust/canvas renderer (parsing into the
canvas runtime, pattern handling, text import). That work and this
one share a substrate — the SVG spec — but live on opposite sides of
the import boundary: `feat-svg/` is about reading SVG into Grida's
scene graph; `feat-svg-editor/` is about editing SVG as SVG,
preserving the author's source on round-trip.

## Contents

### Element IR redesign

- [`svg-editor-intent-matrix.md`](./svg-editor-intent-matrix.md) —
  current-state inventory (no design content) of what the v0
  implementation does today for each public intent × SVG element
  cell. Input to the IR redesign.
- [`element-ir.md`](./element-ir.md) — proposal for a typed
  in-memory element IR that replaces the current per-tag
  `switch`-driven intent dispatch with capability-gated per-element
  records, centralising rotation-pivot tracking, refusal taxonomy,
  and round-trip invariants.

### Subsystem design

- [`hit-test.md`](./hit-test.md) — v1 lessons and v2 architecture
  for hit-testing. Survives a v1 revert.
- [`feedback-transform.md`](./feedback-transform.md) — internal
  critique of the current transform pipeline. Input to the IR
  redesign; cited from the intent matrix.

### Glossary

Defined terms used across the design docs and inside source comments.
When a term appears with the indefinite article ("a Policy Class") and
capitalised, it refers to the entry here.

- [`glossary/policy-class.md`](./glossary/policy-class.md) —
  **Policy Class**. The minimal partition of editable elements such
  that every editing intent admits the same set of legal solutions
  within a class. The unit at which a host's policy decision
  (refuse / native / promote / via-transform) is mappable. Canonical
  case: `<circle>` and `<ellipse>` are different Policy Classes
  because their resize solution spaces differ, even though both are
  conics.

## Related, outside this directory

This directory used to also hold spec-reference, research, and
package-internal docs. Those have moved to their canonical homes:

- **SVG spec reference** —
  [`reference/svg/element-model.md`](../../reference/svg/element-model.md)
  (per-element geometry, presentation, round-trip hazards) and
  [`reference/svg/transform-and-frame.md`](../../reference/svg/transform-and-frame.md)
  (`transform=` syntax, viewport / viewBox, `<use>` instancing).
  Useful to both this package and the Rust importer in `feat-svg/`.
- **Comparative research** —
  [`research/usvg-tree-notes.md`](../research/usvg-tree-notes.md):
  what resvg's `usvg` IR normalises away and what an editor IR must
  refuse.

Additional pointers — the `@grida/svg-editor` package itself, the
`/svg` demo wiring, the AI agent binding, package-internal
reference (geometry, grouping, keybindings), the IR migration
sketch, and SDK-consumer feedback — land with the implementation
slice in a follow-up PR. They are intentionally absent from this
design-only PR.

Status: pre-implementation; design under review.
