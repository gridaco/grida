---
title: "Subtree clone — duplicate and clone-drag"
description: "Design note for the SVG editor's in-document subtree-clone operation: the second of the clipboard FRD's two extraction operations. Specifies the no-closure/no-shell verdict, verbatim-id collision semantics, placement and paint order, who moves during a clone-drag, the mid-drag modifier toggle, and the one-undo-step history bracket."
keywords:
  - svg
  - svg-editor
  - clone
  - duplicate
  - alt-drag
  - clipboard
tags:
  - internal
  - svg
  - wg
format: md
---

# Subtree clone — duplicate and clone-drag

**Status:** Implemented — the TypeScript SVG editor SDK ships this
contract (`commands.duplicate` / `selection.duplicate` (⌘D), and the
Alt-drag translate-with-clone gesture). Tracked as
[gridaco/grida#817](https://github.com/gridaco/grida/issues/817);
deferred from clipboard v1 by
[the clipboard FRD](https://grida.co/docs/wg/feat-svg-editor/clipboard)
§Two extraction operations / §Out of scope.

## Definition

**Subtree clone** is the extraction operation that takes a selection to
**sibling subtrees within the same document**. It is the second of the
two operations the clipboard FRD names, and it is deliberately not a
clipboard client:

- **Payload extraction** (copy) carries the `url(#…)` / `href`
  reference closure and a namespace shell, because the destination is
  unknown and must be assumed to share nothing with the source.
- **Subtree clone** carries **no closure and no shell**. The destination
  IS the source: every reference the cloned subtree makes still resolves
  against the document it already lives in, and carrying definitions
  would deposit a duplicate `defs` block on every duplicate — the exact
  cost the FRD accepts for paste (where Tidy is the recovery) and
  refuses to impose on the in-document gestures that need not pay it.

The two operations share exactly two things — **selection
normalization** (dedupe; live elements only; an ancestor subsumes its
selected descendants; document order regardless of selection order,
because sibling order is paint order and paint order is meaning) and
**verbatim subtree serialization** — and nothing else.

A clone is **verbatim**: the clone's subtree markup is byte-equal to its
origin's, trivia included (attribute order, quote styles, whitespace,
comments). Nothing is normalized, renamed, or repositioned on the way
through.

## Verbatim ids, and what a collision means

Authored `id=""` attributes are cloned verbatim, NEVER rewritten —
silent id renaming is proprietary noise (the same stance the paste
contract takes, for the same reason). Consequences, named:

- Duplicating a node that carries `id="x"` produces a second `id="x"`
  in the document.
- Reference resolution follows the host renderer's duplicate-id rule:
  **first in document order wins**. A cloned subtree's internal
  self-reference (`<g id="a"><use href="#a"/></g>`) therefore resolves
  to the **original**, not to the clone it now lives inside. This is
  the renderer's well-defined semantics, accepted with eyes open.
- Resolving the duplication is the explicit **Tidy** command's mandate,
  never the clone operation's.

## Placement and paint order

Each clone is inserted as its origin's **immediate next sibling**: the
clone paints directly above its origin, and a multi-member selection
interleaves (`A, A′, B, B′`) rather than appending a block of clones at
the end. Per-origin local placement keeps every other sibling
untouched — the diff is exactly the clones, nothing reflows.

## The consumers

### Duplicate (⌘D, `selection.duplicate`)

Duplicates the selection **in place** and moves the selection to the
clones. One history step: a single undo removes the clones and restores
the prior selection. Repeating-offset duplication (duplicate → move →
duplicate repeats the offset) is deliberately out of scope for v1.

### Clone-drag (Alt + translate)

Holding the clone modifier (Alt/Option) during a translate gesture
moves a **clone** instead of the selection:

- **Who moves: the clone.** The origin returns to — and stays at — its
  rest position; the gesture and the selection retarget to the clones.
  (The convention Figma and the main Grida editor share.)
- **Lazy, toggleable, and live.** The clone is created on the first
  frame the modifier is observed held — at gesture start or mid-drag.
  Releasing the modifier mid-drag removes the clones and the origins
  resume following the cursor; pressing again creates fresh clones.
  The toggle takes effect on the flip, not on the next pointer move.
- **Snap retargets with the gesture.** While cloned, the clones are the
  snap agents and the origins become legitimate snap targets (a clone
  can snap against the element it came from).
- **One undo step.** Clone + translate commit as a single history
  entry: one undo removes the clone and the movement together; redo
  restores both. Cancelling the gesture (Escape) while cloned restores
  the document byte-exact, with no history entry.
- A cloned commit with zero **net** movement — drag past the threshold,
  return to the start, release with the modifier held — is a
  duplicate-in-place: same outcome as ⌘D, via the gesture. (A
  press-and-release that never crosses the drag threshold is a tap, not
  a gesture: no translate session opens and no clone is created.)
- If nothing in the selection is cloneable (per the refusals below),
  the modifier is inert: no clone is created and the gesture keeps
  moving the origins.
- The committed entry keeps the gesture's history label ("move") — the
  label is fixed when the gesture opens, before the modifier is known.
- Alt's measurement-overlay role (Alt + hover) is orthogonal and
  coexists: measurement reads the held modifier outside a gesture;
  clone-drag reads it during one.

## Refusals

Refusal is per-member and silent (normalized away), never a thrown
error — cloning is a gesture-grade operation:

| Member                                  | Verdict                                                                                                                                            |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Empty selection / normalizes to nothing | No-op — no mutation, no history                                                                                                                    |
| The document root                       | Skipped — no sibling slot exists                                                                                                                   |
| A nested `<svg>` element                | Skipped — to the current ingestion API a lone serialized `<svg>` is indistinguishable from a document shell; refusing beats silently unwrapping it |
| Stale / detached / non-element ids      | Normalized away                                                                                                                                    |
| A descendant of another selected member | Subsumed by its ancestor (normalization)                                                                                                           |

## Out of scope

Repeating-offset duplicate (the main editor's `active_duplication`
pattern — tracked as
[gridaco/grida#825](https://github.com/gridaco/grida/issues/825));
clone-to-different-parent (the gesture is flat — clones are siblings of
their origins, hierarchy changes during a cloned drag are not modeled);
any defs deduplication on clone (Tidy's job).

The nested-`<svg>` refusal above is an artifact of cloning via the
serialize → re-ingest round-trip, not domain truth. The intended
endpoint is a native document-level subtree copy (no string round-trip,
no shell question), which would retire that refusal row; the verbatim,
no-closure, placement, and id semantics of this note are unaffected by
that change of mechanism.
