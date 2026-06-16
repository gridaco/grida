# Group-first targeting — the hit-test resolution policy

This doc is the **source of truth** for which node a pointer resolves to in
`@grida/svg-editor` (#853). The module
[`src/selection/targeting.ts`](../src/selection/targeting.ts) (`targeting`) is
its **executable shadow**, and the tests in
[`__tests__/targeting.test.ts`](../__tests__/targeting.test.ts) +
[`__tests__/group-first-targeting.browser.test.ts`](../__tests__/group-first-targeting.browser.test.ts)
exercise the rules below — so the doc, the code, and the tests cannot drift.

## Why this is a policy, not logic

There is **no logical or spec rule** that a click must select a container.
Every rule here is a deliberate, human-oriented **UX opinion** — the behaviour
Figma and the non-SVG Grida Canvas editor ship. That is why it lives **outside
`core/`**: `core/` is the opinion-free engine (raw pointer → leaf via
`elementFromPoint` / the fat-hit picker); this module is the labeled layer where
the opinion — "a click selects the group, not the leaf" — is allowed to live.

## Scope: targeting, not gesture

Hit-testing has two halves, in two homes:

| Half          | Question                                    | Home                                               |
| ------------- | ------------------------------------------- | -------------------------------------------------- |
| **Targeting** | _Which node_ does a pointer resolve to?     | **this doc** + `src/selection/targeting.ts` (host) |
| **Gesture**   | Is this a tap, a drag, or a (meta) marquee? | HUD `event/decision.ts` (`@grida/hud`)             |

Targeting is the host's job; gesture is the HUD's. Meta means "drill to the
leaf" (a targeting decision, host-side); the HUD only decides that a meta-**tap**
still selects while a meta-**drag** marquees — the [meta reconciliation](#meta-reconciliation-843)
below.

## The organizing principle

> **The current selection defines the current focus depth in the hierarchy.**

Resolution is a pure function of `(hits, selection, mode)`, where `hits` is the
leaf's ancestor chain, **root-excluded, leaf-first** — `[leaf, …, child-of-root]`:

- **tap** (`deepest:false, nested_first:false`) — a _lateral / sibling-aware_
  move at the focus depth: the ancestor-of-the-leaf closest to the current
  selection by weighted graph distance, **never climbing** to an ancestor of the
  selection (see [no-climb](#no-climb)).
- **double-click** (`nested_first:true`) — _descend one level_ below the focus:
  the nearest **descendant of the selection** toward the leaf.
- **meta / ctrl** (`deepest:true`) — jump straight to the **leaf**, bypassing the
  hierarchy. NOT selection-aware.

### Rules

- **topmost-container** — with no selection (or a selection unrelated to the
  leaf), a tap selects the shallowest node in `hits` (the child-of-root
  ancestor). A leaf with no container ancestor selects itself.
- **stay** — clicking inside the currently-selected container keeps it (graph
  distance 0 wins) — a plain click never auto-deepens.
- **sibling (0.9)** — siblings are weighted 0.9 (< parent/child 1), so clicking
  into a sibling subtree at the focus depth selects that sibling, and clicking a
  sibling leaf stays at the leaf level. This is what makes lateral movement work
  **without** scope/isolation (`state.scope` is unused).
- <a id="no-climb"></a>**no-climb** — a tap is resolved among the leaf's
  ancestor chain **minus the selection's own proper ancestors**: it can move
  laterally, stay, or descend, but it can never _climb_ out of the focus
  (escaping upward is `Escape`'s job, not a click's). Without this, a **cousin
  leaf** resolves to the container it shares with the selection — that shared
  container sits _closer_ by raw graph distance (e.g. with leaf `A` focused,
  hovering its cousin leaf `X` scores the shared parent `G2` at distance 2,
  beating `X` at 3). Dropping the focus's ancestors leaves exactly the
  candidates the non-SVG editor's leaf-only `hits` would have had, so the cousin
  leaf wins. The selected nodes themselves stay selectable, so **stay** (distance 0) is unaffected.
- **descend-one** — a double-click selects the immediate child of the current
  selection on the path to the leaf. Empty selection establishes focus at the
  topmost container, so **progressive** double-clicks descend one level each
  (`G1 → G2 → G3 → leaf`) and are never trapped at depth 1.
- **descend-then-edit** — descending and editing are two distinct phases, and
  never collide. A double-click that lands on a node _deeper_ than the current
  selection only **selects** it (drill). Content-edit opens only when there is
  nowhere deeper to go — the resolved target is _already_ the sole selection —
  and the node is editable. So a double-click into a group peels one level
  (select), and one more double-click on the now-focused leaf edits it. A
  top-level editable node has no container to peel, so the double-click's first
  press selects it and the second edits — it still edits on a single
  double-click. (Host concern: `state.selection` + editability, not pure
  targeting — see `dom.ts`'s `descend_or_enter_content_edit`.)
- **deepest** — meta/ctrl returns the leaf at any depth.
- **stale-safe** — selection ids not connected to the leaf (e.g. from a stale
  tree) are dropped before the distance math, never poisoning it with `Infinity`.

### Determinism

The graph distance is `depth(a) + depth(b) − 2·depth(LCA(a,b))`, with siblings
overridden to `0.9`. Ties resolve to the topmost candidate (first in `hits`).
The distance math and the sibling weight are a port of the non-SVG editor's
`getRayTarget` (`editor/grida-canvas/reducers/tools/target.ts`); the **no-climb**
constraint is svg-editor's own. In the non-SVG editor, structural `<g>` groups
have no geometry and are absent from the raycast `hits`, so its resolver never
sees them as candidates. svg-editor instead **reconstructs the full ancestor
chain** (that is how `<g>` becomes selectable here at all), which re-introduces
the focus's ancestors as candidates — no-climb removes exactly those, restoring
the non-SVG editor's outcome for cousin/sibling hits while keeping group-first
for an empty or unrelated selection.

## Meta reconciliation (#843)

Meta is shared between two gestures, resolved by the HUD without conflict:

- **meta-tap → select the leaf.** The HUD routes a meta press over content to a
  `pend` carrying a deferred `select` (committed on pointer-up); the host's
  `hit_test` resolves that target to the leaf under meta.
- **meta-drag → marquee.** The same pend has no `ids_at_down`, so crossing the
  drag threshold promotes it to a marquee (region-select). Over empty space a
  meta press is a plain marquee.

Hover always previews exactly what a click would select (the HUD uses one
`hit_test` result for both the highlight and the select target), and flips live
as meta is pressed / released.

## Anti-goal

Not customizable. There is no host hook, provider, or registry to swap these
rules. "Extend" means adding a named rule here, a branch in the module, and a
test — three edits in lockstep — not a public API.
