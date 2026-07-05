---
title: Targeting & Selection
description: The pointer→node resolution mathematics — hit chains, graph-distance targeting, descent, deep-select, additive rules, and the marquee predicates including containment suppression.
tags:
  - internal
  - wg
  - editor
format: md
---

**Targeting** is the function that turns a pointer position into the
one node a click means. **Selection dynamics** are the rules by which
that target updates the selection under modifiers, clicks, and
marquees. The golden [ux-surface](./) docs own
the *routing* (which pointer-down becomes which intent, immediate vs
deferred); this document materializes the *resolution* — the
mathematical rules the router calls into — so a second implementation
can reproduce click-for-click behavior.

## Definitions

- **Hit chain** `H`: for a pointer position `p`, the ancestor path
  from the deepest node whose render geometry contains `p` up to (and
  excluding) the scene root, ordered leaf-first:
  `H = [leaf, parent(leaf), …, top]`. Locked and inactive nodes are
  excluded before the chain is formed (HIER-6 side of the contract).
- **depth(n)**: edge count from the scene root to `n`.
- **Graph distance**: `d(a, b) = depth(a) + depth(b) − 2·depth(lca(a, b))`
  — the tree walk length between two nodes.
- **Weighted distance** `d̂`: equal to `d`, except when `a` and `b`
  are siblings, where `d̂ = 0.9` — strictly less than the parent/child
  distance of 1. Siblings beat parents.
- **Selection** `S`: the editor's selected node set. Distance from a
  candidate `c` to `S` is `min over s∈S of d̂(c, s)`.

## The resolution function

`target(H, S, modifiers) → node | none`, with cases evaluated in
order:

1. **Deep modifier held** (the primary/ctrl modifier): return the
   deepest candidate — `argmax depth` over `H`, ties to chain order.
   Deep-select ignores the selection context entirely: it is a jump
   to the leaf.
2. **`S = ∅`**: return the **shallowest** candidate — the top-level
   node under the pointer. An unfocused click never lands inside a
   subtree.
3. **`S ≠ ∅`** — *lateral resolution*:
   - Filter `H` by the **no-climb rule**: remove every node that is a
     strict ancestor of any member of `S`. Clicking never climbs out
     of the depth the user has entered; a shared container never
     steals a click meant for a cousin. If the filter empties the
     chain, fall back to the unfiltered chain.
   - Return `argmin` of weighted distance to `S`; ties break to the
     shallowest, then to chain order.

The sibling weight is the load-bearing constant: with a child of a
container selected, a click on a sibling shape (distance 0.9) beats
the container itself (distance 1), which is what makes lateral
movement through a nested layout feel flat.

**Determinism**: the function is pure in `(H, S, modifiers)`. Two
identical clicks resolve identically; there is no timing, hover
history, or velocity input.

## Descent — double-click

Double-click **descends one level** toward the point:

- Precondition: `S = {s}` (single selection) and `s ∈ H` — the click
  is inside the selected node.
- Candidates: descendants of `s` on the chain. Return the nearest by
  (unweighted) graph distance — i.e. the **next child on the path
  toward the leaf**, not the leaf itself.
- Repeated double-clicks peel one level each: `container → group →
  shape`.
- When the resolved target *is already* the sole selection and the
  node has an editable content mode (text, vector), the double-click
  enters that mode instead ([vector-edit](../../feat-vector-network/vector-edit.md), text
  editing). Descend-then-edit is one continuous idiom: double-clicks
  walk down the tree until the leaf, and one more enters the leaf's
  content.

## Additive selection — the toggle modifier

With the toggle modifier (shift) held, a click toggles the target's
membership. Two structural rules:

- **Grow on down, shrink on up.** A click that would *add* to the
  selection commits on pointer-down; a click that would *remove* (or
  narrow to) an already-selected node is **deferred to pointer-up**
  and cancelled if a drag begins. This asymmetry is what lets a user
  grab one member of a multi-selection and drag the whole selection
  without destroying it.
- **No parent–child co-selection.** The selection never contains a
  node and its ancestor simultaneously; the later selection wins and
  the conflicting relative is dropped. Mixed *depths* are legal
  (a node from one subtree plus a node from another); mixed *lineage*
  is not.

## Marquee

A drag from empty space selects by rectangle. Resolution over the
final (and every intermediate) rect `R`:

1. **Predicate — intersection.** A candidate is *touched* when its
   world AABB intersects `R`. Containment is not required.
2. **Captured-parent rule (depth).** A nested node is selected only
   if its parent is also touched (or its parent is the scene root /
   current scope). The marquee works at the top level of the scope by
   default instead of spraying selection across deep descendants.
3. **Containment suppression (the backdrop rule).** Order the touched
   candidates back-to-front. A candidate whose AABB **contains** `R`
   is *suppressed* unless it is the front-most touched candidate.
   Consequence: dragging a marquee inside a full-bleed background
   plate selects the foreground content on top of it, not the plate;
   the plate joins the selection only once the marquee crosses its
   edge (at which point it no longer contains `R`). The rule's
   corollary is *escape*: shrinking the marquee back inside the plate
   releases it.
4. **Additive**: with the toggle modifier, the result unions with the
   selection as it stood at drag start; without, it replaces.
5. **Live**: selection updates on every marquee move under the same
   rules — the marquee's final state is never a surprise relative to
   its preview (SURF-7).

Locked and inactive nodes are never marquee candidates.

## Hover

Hover targeting **is** click targeting: the hovered node is
`target(H, S, modifiers)` with the live modifier state, so the hover
outline is always an honest preview of what a click would select —
including flipping to the leaf while the deep modifier is held.
Hover is suppressed during an active gesture.

## Contracts

- **TGT-1** Empty-selection click selects the shallowest node on the
  hit chain; with the deep modifier, the deepest.
- **TGT-2** Sibling preference: with a container's child selected, a
  click over a sibling (overlapping the container) selects the
  sibling, not the container.
- **TGT-3** No-climb: with a nested node selected, no plain click
  inside the same top-level container resolves to an ancestor of the
  selection.
- **TGT-4** Double-click descends exactly one level toward the point;
  N double-clicks from the top reach depth N; one more on an
  editable leaf enters its content mode.
- **TGT-5** Grow-on-down / shrink-on-up: an additive click on an
  unselected node changes selection at pointer-down; a click on a
  selected node changes selection only at pointer-up, and a drag
  begun in between cancels the change.
- **TGT-6** The selection never contains a node together with its
  ancestor.
- **TGT-7** Marquee captured-parent rule: a marquee touching a nested
  child but not its parent does not select the child.
- **TGT-8** Containment suppression: a marquee drawn strictly inside
  a background node that also touches foreground nodes selects only
  the foreground; extending it past the background's edge adds the
  background.
- **TGT-9** Hover-click agreement: at any instant, clicking selects
  exactly the node the hover outline indicates.
- **TGT-10** Determinism: targeting depends only on the hit chain,
  the selection, and modifier state.
