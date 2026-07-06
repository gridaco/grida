---
title: Edit Mode
description: The exclusive nested-editing slot and its taxonomy — content modes (text, vector, with width as a vector facet) vs paint sessions (gradient, image) — replacing the flat production union.
tags:
  - internal
  - wg
  - editor
format: md
---

The editor has one **edit-mode slot**: at most one nested editing
context is active, it owns the canvas's meaning while it lives —
chrome, tools, and keys re-resolve against it ([routing](https://github.com/gridaco/grida/blob/main/crates/grida_editor/docs/routing.md)
capture layer) — and Enter is the front door while Escape is the way
out. The production editor models this slot as a flat union of six
"content edit modes." This document specifies the slot's mechanics,
and — because two of the six members are legacy or mislabeled —
replaces the flat union with a taxonomy that says honestly _what each
mode edits_.

## The slot

- **Exclusive**: at most one mode at a time. Entering a mode ends the
  previous one _through its normal exit_ (cleanup runs; nothing is
  abandoned).
- **Domain**: the active mode is **authoring context** (golden
  [state model](./state.md)) — undoable, never persisted
  to file, replicated at most as presence. Undo that crosses the
  mode's entry ends the mode.
- **Subject-pinned**: a mode addresses one subject — a node, or one
  paint of a node — fixed at entry. If the subject is deleted (or
  undone away), the mode ends without residue.
- **Capture**: while a mode is active it sits above the binding table
  in the routing ladder; keys mean what the mode says first.

## The taxonomy

Classify by the **subject of editing**, not by how the mode happens
to be entered:

### Content modes — the node's material

**Text** and **vector** edit the node's content — the very thing the
node _is_. They are what the name "content edit" honestly describes:

- Entered by the **enter idiom** — Enter on a single selected node or
  the double-click descent ([traversal](./traversal.md) TRAV-1,
  [targeting](./ux-surface/targeting.md) TGT-4).
- Exited by the Escape ladder; content modes may have internal rungs
  (vector's disconnect → tool → exit; text exits in one). Pointing
  outside the subject also exits — the enter idiom's inverse
  (vector: double-click on empty canvas, VEC-13; text: the session's
  outside-click commit).
- Carry the **cleanup doctrine**: empty authoring leaves no trace —
  an empty text node is deleted at exit, a degenerate vector network
  is deleted at exit, and an untouched subject is restored exactly
  ([vector-edit](../feat-vector-network/vector-edit.md) VEC-1/2; the text twin is
  contract-bound below).
- May host their own tools (vector: pen, bend, lasso, width) and
  their own nested undo (text's session undo drains before document
  undo).

### Facets — a lens inside a content mode

The production union carries a **width** mode as a peer of text and
vector. It is not a peer. Every fact about it says _nested_: it can
only be entered from vector editing (its tool is illegal anywhere
else), it operates on the same node and carries the vector context
across, and — uniquely in the union — exiting it **returns to vector
mode** rather than to selection. The flat union cannot express
nesting, so production fakes it with a tool-revert side channel.

This spec models it structurally: the vector content mode has a
**facet** — `geometry` (the default: vertices, segments, tangents)
or `width` (the variable-width profile: stops at parametric
positions along the curve, each with a radius). The width tool
switches the facet; leaving the facet lands on `geometry` of the
same mode, same node. A facet is _not_ a second slot entry: Escape
from the width facet steps to the geometry facet, then the ordinary
vector ladder continues. Future lenses over the same material (e.g.
a paint-points facet) join as facets, not as new union members.

### Paint sessions — a property's value

**Gradient** and **image** editing operate on a _paint_ — one entry
of a fill/stroke paint list — not on the node's content. Calling
them "content edit modes" is the squat this review removes. They are
**paint sessions**:

- Subject: `(node, fill|stroke, paint index)` — a property address.
- Entered from the **paint's own control**: expanding a gradient or
  image paint in the [properties panel](https://github.com/gridaco/grida/blob/main/crates/grida_editor/docs/properties.md) opens the
  session; the panel control and the canvas chrome are two views of
  one state. One canvas entry exists by user-intent dispatch:
  double-clicking a shape whose fill is an image means "edit the
  image" and opens the image session (see the dispatch table).
  **Enter never opens a paint session.**
- Exited by Escape (one press — sessions have no internal rungs), by
  collapsing the panel control, or structurally: re-typing the paint
  away (gradient → solid) or removing it ends the session.
- No cleanup doctrine: edits commit against the paint as they
  happen; there is no "empty paint" to delete.
- Session chrome: gradient — the transform control points and the
  color-stop track; image — the transformed image quad with side
  handles (scale), corner handles (rotate), and body drag (translate).
  This slot owns the sessions' _lifecycle_; the canvas surfaces
  themselves and the normalized transform model each edits are specified
  in [paint-session](./paint-session/) (`GRAD-*`, `IMG-*`).

**Excluded**: the production union's **bitmap** member is legacy and
is not part of this spec; raster editing, if it returns, would be a
content mode (it edits a node's material) and must re-enter through
this taxonomy.

## The dispatch table

The enter idiom resolves by the subject, in this order:

| Selected subject                                                   | Result                                                                                                           |
| ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| text node                                                          | text content mode                                                                                                |
| shape/vector with an **image fill**                                | image paint session (user intent: "edit the image")                                                              |
| vector node                                                        | vector content mode                                                                                              |
| path-reducible primitive (rectangle, ellipse, polygon, star, line) | flatten, then vector content mode (entry is a commitment — [vector-edit](../feat-vector-network/vector-edit.md)) |
| container / anything else                                          | not enterable — Enter falls through to select-children (TRAV-1)                                                  |

Gradient sessions have no row: they are reachable only from the
paint control, because a gradient has no canvas-hit identity apart
from the node that carries it.

## Tools and modes

Each mode declares its **legal tool set**; the slot and the tool
system compose, never race:

| Mode                    | Legal tools                     |
| ----------------------- | ------------------------------- |
| text                    | (none — the session owns input) |
| vector / geometry facet | cursor, pen, bend, lasso        |
| vector / width facet    | width (the facet _is_ the tool) |
| paint sessions          | cursor only                     |

Arming a tool outside its mode's legal set is refused
([tool](./tool.md) reserved-key discipline); arming a mode-scoped
tool (lasso, bend, width) outside its mode is a no-op. Exiting a
mode reverts mode-scoped tools to cursor.

## Escape, end to end

One press, one rung, across the whole system
([routing](https://github.com/gridaco/grida/blob/main/crates/grida_editor/docs/routing.md) ROUTE-5):

```
width facet      → geometry facet
vector: sub-selection or pen projection → clear (disconnect)
vector: non-cursor tool → cursor
any active mode  → exit the mode
non-cursor tool  → cursor
selection        → deselect
```

## Contracts

- **MODE-1** Exclusivity: entering any mode while another is active
  runs the previous mode's full exit (cleanup included) before the
  new mode exists; no observable state ever holds two modes.
- **MODE-2** Dispatch: the enter idiom resolves exactly per the
  dispatch table; Enter never opens a paint session; a gradient
  session is unreachable from the canvas alone.
- **MODE-3** Text cleanup twin: exiting text mode with empty content
  deletes the node; exiting with unchanged content leaves document
  and history untouched (binds VEC-1/2's doctrine to text).
- **MODE-4** Facet nesting: the width facet is enterable only from
  vector mode, addresses the same node, and Escape from it lands on
  the geometry facet of the same mode — never on plain selection.
- **MODE-5** Panel–session agreement: a paint session is active iff
  its paint control is open; expanding enters, collapsing exits, and
  re-typing or removing the paint ends the session in the same
  dispatch.
- **MODE-6** Subject pinning: deleting the subject node, or undoing
  past the mode's entry, ends the mode with no residue (no orphan
  chrome, no dangling session state).
- **MODE-7** Domain: the active mode round-trips through undo/redo
  as authoring context and never appears in a saved document.
- **MODE-8** Tool legality: no input sequence arms a tool outside
  the active mode's legal set; mode-scoped tools are no-ops outside
  their mode.
- **MODE-9** Session undo drains first: inside text mode, undo
  consumes the session's own steps before touching document history;
  the committed result is one document entry.
- **MODE-10** Escape is total and single-stepped: from any state in
  this document, repeated Escape reaches plain no-selection in
  finitely many presses, one rung per press, through the ladder
  above.
