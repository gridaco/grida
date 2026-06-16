# Selection state — the subtree-roots invariant

The selection is always its **subtree roots**: it never contains a node
together with one of its ancestors. `set_selection`
([`core/editor.ts`](../src/core/editor.ts)) enforces this in **one place** via
[`SvgDocument.prune_nested_nodes`](../src/core/document.ts) — any id whose
ancestor is also present is dropped. The executable shadow is
[`__tests__/selection-subtree-roots.test.ts`](../__tests__/selection-subtree-roots.test.ts).

## Why

A node selected together with its ancestor is redundant — selecting `G` already
drives `G`'s whole subtree, so also holding `G`'s children `A`, `B` is
"effectively just `G`". Worse, the redundant pair is **mixed-parent** (`A`/`B`
under `G`; `G` under root), which makes structural features (group, …) see an
ambiguous selection.

Enforcing the invariant once, at the selection-state chokepoint, is a
roles-and-responsibilities decision: the selection **state** owns "what is a
valid selection"; **features** own "what to do with it". So `group`, `remove`,
`translate`, `rotate`, … receive a clean selection and stay **dumb** — none
re-derives nesting.

## The rule

```
selection = prune_nested_nodes(requested)
```

- A node whose ancestor is also requested is **dropped**.
- The order of retained ids is **preserved**.
- It applies to **every** selection path — `select` (replace / add / toggle),
  marquee, `select_all`, programmatic — because they all funnel through
  `set_selection`. Single-node selections short-circuit inside `prune`.

## Examples

| Requested                           | Selection               | Why                                   |
| ----------------------------------- | ----------------------- | ------------------------------------- |
| `[G]` where `G` ⊃ `A, B`            | `[G]`                   | already a root                        |
| `[G, A, B]`                         | `[G]`                   | `A`, `B` are `G`'s descendants        |
| `[G, A, B, Z]` (`Z` sibling of `G`) | `[G, Z]`                | the marquee case                      |
| `[A, B]` (siblings)                 | `[A, B]`                | neither is the other's ancestor       |
| `[A]` + add `G`                     | `[G]`                   | the child is absorbed by its ancestor |
| `select_all`                        | scope's direct children | already siblings — unchanged          |

## Consequence

Features consume `state.selection` as-is. `remove` and the translate / rotate
pipelines still call `prune_nested_nodes` themselves — those calls predate this
invariant and, where they operate on `state.selection`, are now redundant
(idempotent no-ops) that could be dropped in a follow-up R&R pass. Not every
existing caller is redundant, though: `clipboard` prunes its **outbound
reference closure** (defs it collected, not the selection) and
`subtree.normalize_roots` also **dedupes + drops stale ids** — both do real work
beyond this invariant and stay.

## Not

- **Not** deduplication of unrelated nodes — siblings and cousins stay.
- **Not** a sort — retained order is the requested order.
- **Not** customizable — a fixed product decision, like the marquee and
  group-first policies ([`marquee-selection.md`](./marquee-selection.md),
  [`group-first-targeting.md`](./group-first-targeting.md)).
