---
title: Create Outlines
description: Convert text to its glyph-outline vector paths — the deliberate, font-baking counterpart to editable type; per-node and in-place, distinct from flatten's union.
tags:
  - internal
  - wg
  - canvas
  - vector
  - editor
format: md
---

**Create Outlines** converts a text node into the **vector paths of its
laid-out glyphs** — the operation a designer reaches for to bake type
into art (to nudge a single letterform, or to hand off print-safe
geometry that needs no font). It is the text twin of the single-node
flatten ([`flatten_to_vector`](./flatten.md)): **per node, in place**,
identity preserved. It is *not* [flatten](./flatten.md) (which *unions*
a selection into one vector), and *not* outline mode (the wireframe
*view*).

## Why it is its own command

Text-to-outline is distinct from flatten on three axes, and conflating
them is a known wart — the web editor folds text into its flatten set
but leaves a standing TODO to split it into a separate api
(`vector.textToVectorNetwork()`):

- **Different subsystem.** Flatten bakes geometry from a shape builder.
  Outlining text requires **font shaping** — laying the string out into
  glyph runs, then taking each glyph's outline path. A pure-geometry
  path cannot do it.
- **Different semantics.** Flatten *unions* the selection into one
  vector. Create Outlines converts **each text node independently**,
  keeping it a separate object at its own position — you outline type to
  then manipulate *its* letterforms, not to merge it with neighbors.
- **Different intent.** "Create outlines" is a named act designers
  invoke deliberately on type; "flatten my text" is not how anyone
  thinks about it.

## The operation

For **each text node** in the selection, independently:

- **Shape and outline.** The node's paragraph is laid out exactly as it
  renders — the same shaping, wrapping, alignment, and fonts — and each
  glyph's outline becomes vector geometry. The result paints
  **identically** to the text it replaces.
- **Replace in place.** The text node is swapped for a vector node at
  the **same identity** — id, name, tree position, and transform
  preserved. The paragraph's fills carry to the vector, so the color
  does not jump.
- **Non-text members are left unchanged**, and stay selected. Create
  Outlines never touches shapes; it is text-only.

The whole command is **one history entry**; undo restores the text
(still editable). Because each node is replaced at its own id and
transform, no re-anchoring or union math is involved — the vector lands
exactly where the text was.

## The font dependency

Shaping needs the runtime's fonts. A text node whose fonts are
unavailable is **left unchanged** (the command declines for it), never
approximated — the same honest degradation flatten makes for its
backend-gated kinds ([flatten.md](./flatten.md) `FLAT-2`). This is why
the capability is offered only where a font backend is present; a
headless caller with no fonts outlines nothing.

## Relation to flatten

Flatten composes this: when a [flatten](./flatten.md) selection includes
a text member, flatten delegates that member to the **same** text→vector
conversion (so "flatten everything" on mixed type + shapes bakes the
text into the union too). Create Outlines is the dedicated, per-node
command; the shared primitive is the one font-backed conversion both
call.

## Contracts

- **OUTL-1** Per-node, in place: each selected text node is replaced by
  a vector node carrying its laid-out glyph outlines, at the **same**
  id, name, tree position, and transform; the paragraph's fills carry to
  the vector. Non-text members are left unchanged.
- **OUTL-2** Render fidelity: the outline is the paragraph as laid out
  (shaping, wrapping, alignment, fonts as rendered), so the vector
  paints where and how the text did.
- **OUTL-3** Font dependency: a text node whose shaping backend/fonts
  are unavailable is left unchanged (declines), never approximated;
  with no font backend at all, the command outlines nothing and
  declines.
- **OUTL-4** Per-node independence: every text node in the selection is
  converted independently — never unioned — so N text nodes yield N
  vectors, each at its own place.
- **OUTL-5** One entry: the whole conversion is a single history entry;
  undo restores the editable text.

Deferred, named: preserving rich per-run styling as multiple filled
regions (the first pass carries the node-level fill); stroked-text
outline (expand the glyph strokes) — the stroke-outline sibling, not
this fill-outline command.
