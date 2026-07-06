---
title: Boolean Operations
description: Non-destructive path booleans — the operand model, order semantics, live re-evaluation, release and flatten.
tags:
  - internal
  - wg
  - editor
format: md
---

A **boolean node** combines the geometry of its children into one
path — union, intersection, difference, or exclusion (xor) — while
keeping the children alive. It is the non-destructive counterpart to
flatten: the document stores _operands plus an operation_, and the
result is computed, never persisted.

## The model

- A boolean is a **parent node kind** with children and one field:
  `op ∈ {union, intersection, difference, xor}`.
- It carries its **own paint** — fills, strokes, corner radius,
  effects, opacity, blend. The children contribute geometry only;
  their paints have no effect while parented under the boolean.
- **Evaluation**: children in document order; the first child is the
  base, and each subsequent child combines into the accumulated path
  using `op`. Order is semantic for `difference` — the base minus
  everything above it; `union`, `intersection`, and `xor` are
  order-independent. Nested boolean children evaluate recursively.
  Corner radius applies to the merged result.
- **Operands must be path-reducible**: shapes, vectors, text, and
  boolean nodes. A plain group is not a legal operand today — a
  named exclusion (adopting one would mean recursive flattening at
  evaluation time), not an accident.
- Evaluation requires a path-ops-capable rendering backend; a
  backend without path booleans cannot host this node kind, and the
  editor must say so rather than render wrongly.

## Creation

Applying a boolean command to a selection:

- **N nodes** wrap into a new boolean node: per
  [selection partition](../canvas/ux-surface/selection-partition.md)
  (one boolean per shared parent — PART-3), in their existing relative
  order, positioned at the union of their bounds, with each child
  re-anchored so its **world position does not move** — structurally
  identical to [grouping](../canvas/grouping.md) (the same discipline as
  TOOL-5 adoption). One history entry.
- The new boolean adopts a **representative paint** from its
  children, so the merged result does not visually jump at the
  moment of creation.
- **A single already-boolean selection retargets**: applying an op
  to one selected boolean updates its `op` in place — no new
  wrapper, one entry.

## Editing

- On canvas, a boolean targets as **one unit**: its children are not
  lateral click targets, it is not an adoption target for dragged
  nodes, and its children do not leave it by translate
  ([translate](../canvas/translate.md) TRL-7 — booleans are closed parents).
- Children remain **live document nodes**: reachable through the
  hierarchy panel, editable there and via deep entry, and every
  child mutation re-evaluates the rendered result immediately.
- **Release (ungroup)** dissolves the boolean: children return to
  the boolean's parent at its z-position, world positions preserved,
  their own paints visible again. One entry.
- **Flatten** bakes the evaluated result into a single vector node —
  the destructive exit. The flattened node renders pixel-identical
  to the boolean it replaces and carries the boolean's paint.

## Contracts

- **BOOL-1** Creation preserves the picture: wrapping N nodes moves
  nothing on screen (world positions and relative z-order
  unchanged), and undoes in one step.
- **BOOL-2** Order semantics: `difference` subtracts later children
  from the first; reordering children changes the difference result
  and leaves union/intersection/xor results unchanged.
- **BOOL-3** Retargeting: a boolean command on a single boolean node
  changes only its `op` — same node id, same children, one entry.
- **BOOL-4** Non-destructive: release restores the children as
  ordinary siblings with their world positions and own paints; the
  document after create → release is structurally equal to the
  original (wrapper id aside).
- **BOOL-5** Live evaluation: mutating a child's geometry changes
  the rendered result within the same reflect cycle
  ([frame](https://github.com/gridaco/grida/blob/main/crates/grida_editor/docs/frame.md)); no stale result is ever painted.
- **BOOL-6** Flatten equivalence: the flattened vector renders
  pixel-identical to the boolean's result; undo restores the boolean
  intact.
- **BOOL-7** Paint authority: the result is painted exclusively with
  the boolean's own paints; changing a child's fill has no rendered
  effect until release or flatten.
- **BOOL-8** Closed parent: no canvas pointer sequence selects a
  boolean's child directly or re-parents a node into or out of a
  boolean.
