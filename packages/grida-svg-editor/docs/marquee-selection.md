# Marquee selection — the resolution policy

This doc is the **source of truth** for what a marquee selects in
`@grida/svg-editor`. The module [`src/selection/marquee.ts`](../src/selection/marquee.ts)
(`marquee_selection`) is its **executable shadow**, and the tests in
[`__tests__/marquee-selection.test.ts`](../__tests__/marquee-selection.test.ts)
quote the rule names below verbatim — so the doc, the code, and the tests
cannot drift apart. Read this doc to know the rules; read the module to see
them run.

## Why this is a policy, not logic

There is **no logical or spec rule** here. Every rule below is a deliberate,
human-oriented **UX opinion** (the same behaviour Figma and peers ship). That
is exactly why it lives **outside `core/`**: `core/` is the opinion-free
engine — agnostic geometry from `@grida/cmath`, the marquee gesture from
`@grida/hud` — and this module is the labeled layer where the opinion is
allowed to live. Keeping it here, doc-anchored and test-pinned, is what stops
it leaking into the engine and drifting silently.

## Scope: resolution, not routing

The marquee UX has two halves, in two homes:

| Half           | Question                                                                                               | Home                                                                                                                     |
| -------------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| **Routing**    | _When_ is a drag a marquee? (empty space, shift, **meta** even over content, the move-region override) | HUD `event/decision.ts` + spec [`selection-intent.md`](https://grida.co/docs/wg/feat-editor/ux-surface/selection-intent) |
| **Resolution** | Given a marquee rect, _which boxes_ does it select?                                                    | **this doc** + `src/selection/marquee.ts`                                                                                |

This doc owns **resolution only**. `selection-intent.md` scopes marquee
intersection semantics out as a non-goal; this is its sibling.

## Determinism

The selection is a pure function of three inputs:

```txt
selection = f(marquee rect, gesture-start selection, shift)
```

`meta` is **not** an input here. Meta is a _routing_ modifier — it decides
that a drag is a marquee at all (even started over an element) — it never
changes how the rect resolves. The marquee rect is frozen-snapshot box
geometry against the live rect; the gesture-start selection is the additive
baseline; shift is additive on/off.

## The rules

Each rule has a name. The module's functions and the tests use these names.

### `shadow`

The base is "select every box the marquee **intersects**." The one
refinement: a box that fully **contains** the marquee rect is a behind/around
target — it is kept only when it is the **front-most** box the marquee
touches. A box in front of it that the marquee also touches **shadows** it.

Pure `cmath.rect.intersects` + `cmath.rect.contains` + paint order
(front-most = last). No hierarchy, no parent/child — just boxes and z-order.

### `escape`

A corollary of `shadow`: once the marquee grows past a box's edge, the box no
longer **contains** the marquee, so it stops being shadowable and is selected
as a normal hit again.

### `paint-order`

Results are returned in paint order (back → front). The snapshot the surface
feeds in is paint-ordered (`_ensure_z_order`), which is what makes "front-most
= last" meaningful.

### `additive`

Shift unions the **gesture-start** selection (the baseline), baseline-first
and deduped. Because the baseline is fixed for the gesture, shrinking the rect
**releases** the members the rect added while keeping the baseline — it never
strands a freshly-added member.

## Worked example

Boxes `A: 0,0,100,100` and `B: 40,40,20,20` (B inside A, painted in front).
Marquee anchored at `30,30`:

| drag to   | rect          | result   | rule                                          |
| --------- | ------------- | -------- | --------------------------------------------- |
| `30,30`   | `30,30,0,0`   | **A**    | front-most-and-only box touched               |
| `50,50`   | `30,30,20,20` | **B**    | `shadow` — A contains the rect, B is in front |
| `110,110` | `30,30,80,80` | **A, B** | `escape` — rect passes A's edge (110 > 100)   |

## Anti-goal

**Not a customizable selection policy.** These rules are a fixed product
decision; the surface exposes no hook, provider, or registry to swap them.
"Extend" means adding a named rule here, a function in the module, and a test
that quotes its name — three edits in lockstep — not a public API. (This is
the README anti-goal "Not a customizable selection policy.")
