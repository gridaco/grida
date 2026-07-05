---
title: Properties Panel
description: The inspector — property→control mapping, multi-selection mixed-value model, computed vs authored values, and commit atomicity.
tags:
  - internal
  - wg
  - editor
format: md
---

The properties panel (inspector) displays and edits the properties of
the current selection. Its semantics are extracted from the
production editor and normalized here; the panel itself contains no
editing logic (ARCH-3) — it reads via queries/observation and writes
via mutations, through widget bindings. The full property inventory —
every section, property, and control kind — is the
[properties sheet](./properties-sheet.md).

## Sections and visibility

Properties group into sections: **base** (name, active, locked),
**geometry** (position, size, rotation), **layout** (flex container
properties; padding, gap, alignment), **appearance** (opacity, blend
mode, corner radius), **fills**, **strokes**, **effects**, **text**
(typography, only for text nodes), **image** (fit, source; only for
image nodes), **export**.

Visibility is **capability-driven**: a section/control shows when at
least one selected node's type supports the property (the
type-intersection rule), and never otherwise. Capability is a schema
query ("does this node type support strokes?"), not a hand-list in
the panel.

**Empty selection is a subject, not an absence**: the panel never
unmounts to nothing — with nothing selected it inspects the **scene**,
whose first (and for now only) property is the background color, the
"solid background" layer of the canvas stack
([transparency-grid.md](../../../docs/wg/canvas/transparency-grid.md)). The control edits
the scene-field domain of the mutation vocabulary
([document.md](./document.md) `scene(op)`) through the same widget
binding contract as every node property, and clearing it back to
"none" reveals the transparency grid.

## Multi-selection: the mixed-value model

For each displayed property over selection `ids`:

```
mixed_value {
  value:   T | MIXED          // the common value, or the sentinel
  partial: bool               // some selected nodes lack the property
  values:  [(value, ids)]     // the distinct values and who has them
}
```

- Controls bound to `MIXED` render the mixed state (WID-6).
- **Editing broadcasts**: committing a value on a mixed property sets
  it on _all_ selected nodes that support it — one batch, one history
  entry (HISB-1 scope).
- Relative edits (`delta`) apply per-node against each node's own
  current value.
- **List-valued properties** (fills, strokes, effects) are editable
  only when all selected nodes have equal lists; otherwise the
  section renders a single mixed indicator (no per-item editing of
  heterogeneous lists).

## Computed vs authored

The panel displays computed values where layout owns them (a flex
item's position/size) but marks them read-only or `auto`; editing an
`auto` dimension converts it to an authored value. The general rule: a
control never lets the user author a value that the system will
immediately override — it either shows the computed value read-only
or converts the property to authored on edit.

## Value lifecycle

Every control follows the widget binding contract: previews render
live (through `silent` dispatch), one commit per interaction, revert
on cancel. List sections additionally support: add item (appended
with a sensible default), remove item, toggle item active, and
reorder — each a single committed batch. Expanding a gradient or
image paint opens that paint's **session** — canvas handles and the
panel control as two views of one editing state
([edit-mode](../../../docs/wg/canvas/edit-mode.md) MODE-5). Paint lists display
top-most-first while storing document paint order; the panel owns the
reversal (same principle as the hierarchy's DOC-order rule).

## Contracts

- **PROP-1** Type-intersection visibility: a text-only control never
  renders for a selection with no text node; a section renders iff
  supported by ≥1 selected node.
- **PROP-2** Mixed detection is exact: equal values → common value;
  any difference (including presence vs absence) → `MIXED` with
  correct `values` partition.
- **PROP-3** Broadcast commit: committing opacity over a 3-node mixed
  selection yields one history entry; undo restores all three prior
  opacities in one step.
- **PROP-4** Delta on mixed: a `delta:+1` step over values {10, 20}
  commits {11, 21} in one entry.
- **PROP-5** Auto conversion: editing an auto dimension of a flex
  item authors the typed value and the layout result reflects it;
  the control leaves the read-only state.
- **PROP-6** Heterogeneous lists are guarded: with differing fill
  lists selected, no fill mutation is reachable from the panel.
- **PROP-7** Observation granularity: a dispatch that changes only
  stroke width does not rebuild the text section (binds ED-2 to
  panel sections).
- **PROP-8** The color hot path meets its performance budget
  end-to-end (defined in [harness.md](./harness.md)) while
  satisfying WID-4.
- **PROP-9** Empty selection inspects the scene: the panel stays
  mounted and edits the scene's background color through the mutation
  vocabulary — one history entry per interaction, undo restores the
  prior background (including "none").
