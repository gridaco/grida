# Group snap policy

## Status

**Current (alpha.10): Figma-shaped descent.** `<g>` participates in
snap as **its own bbox AND each rendered descendant leaf**, on both
sides:

- As **agent** (a group is being dragged): the agent rect set is
  `[group_bbox, ...rendered descendant leaf rects]`. Rigidity is
  preserved — the apply path still writes a single delta to the
  group's `transform` attribute.
- As **target** (a sibling group sits in the neighborhood): the
  neighbor rect set contains `[group_bbox, ...rendered descendant
leaf rects]`. Inner-edge snap is reachable without ungrouping.

This matches Figma's behavior for groups and frames: group-to-group
bbox alignment is preserved (the group's own bbox stays in the
candidate set), and inner-edge snap "just works."

**Previously (alpha.9 and earlier): opaque.** `<g>` was a single rect
(its bbox). No descent. Phase 1 of this work ratified that behavior
in tests and fixed the empty-group "jerk to origin" bug; Phase 2
flipped the policy.

## Why descent

A full A/B/C review (opaque / transparent / contextual) was held this
branch. Summary:

- **A (opaque, previous):** predictable, rigid groups preserved, cheap.
  But Figma — the reference design tool for our audience — does
  descent. Users coming from Figma will internalize "Grida snap
  doesn't see inside groups" as a deficit, not a virtue.
- **B (descent, current):** industry-standard. Descendant leaves
  _plus_ the group bbox both participate. Real engineering work
  (rendering filter, subtree-aware exclusion, recursive walker) but
  bounded — the baseline structure, geometry provider, and snap
  algorithm all stay the same; only the **set of rects fed in**
  changes.
- **C (contextual, modifier + drilled state):** ships A + B + a
  modifier subsystem + a drill-state subsystem. Highest ceiling,
  highest half-shipping risk; Figma doesn't ship this — they ship B.

## How it works

Two helpers live in [`neighborhood.ts`](./neighborhood.ts):

```
snap_descent(doc, id) -> NodeId[]
  if id is not <g>          → [id]
  if id is <g> & not rendered → []
  if id is <g> & rendered    → [id, ...rendered structural descendants]
                               (recurses through nested <g>; includes
                                each nested <g>'s id as well as its
                                leaves)
```

```
compute_neighborhood(doc, dragged) -> NodeId[]
  excluded = full subtree of every dragged id (subtree-aware exclusion,
             so a leaf inside a dragged group cannot self-snap)
  for each dragged id:
    add parent (if structural)
    for each sibling of parent:
      skip if excluded
      skip if not in STRUCTURAL_GRAPHICS_SET
      skip if not self-rendered (display/visibility/resource-container)
      add snap_descent(sibling) to result
```

The agent side runs the symmetric expansion in
[`open_snap_session_for`](../../dom.ts) before resolving rects:

```ts
const agent_id_set = new Set<NodeId>();
for (const id of ids) {
  for (const inner of snap_descent(doc, id)) agent_id_set.add(inner);
}
```

The rendering filter (`is_self_rendered`) drops:

- `display="none"` or `visibility="hidden"` on the element itself
- Tags whose subtree is never drawn: `defs`, `symbol`, `clipPath`,
  `mask`, `pattern`, `marker`, `filter`, `linearGradient`,
  `radialGradient`.

Ancestor visibility is **not** walked from each descendant — descent
runs from a known-rendered root, so any reachable descendant has a
rendered ancestor chain by construction. Comprehensive SVG rendering
visibility (conditional processing, `requiredFeatures`,
`systemLanguage`) is **out of scope**; not worth chasing for an
editor.

## What stays the same

This is the reason the change is tractable:

- `TranslateBaseline` union and dispatch — `<g>` still uses
  `viaTransform`; apply still writes a single delta to the group's
  `transform` attribute. **Group rigidity is preserved** even though
  many leaves participate as anchors. (Rationale: one delta is
  chosen per frame; that single delta translates the group as a
  unit.)
- `capture_translate_baseline` / `apply_translate` /
  `compose_leading_translate`.
- `SvgGeometryDriver.bounds_of` — already world-space AABB via
  `getBBox + getCTM`; transform composition through nested groups
  is already correct, we just call it on more ids.
- `SnapSession.snap()` algorithm — unions agent rects internally;
  feeding it N rects instead of 1 is transparent.
- The `nudge-dwell-watcher` narrow port (`document`, `state.selection`,
  `subscribe_geometry`, `is_busy`). Descent happens inside
  `open_snap_session_for`, which the watcher already calls; no new
  fields on the port.
- The HUD compositor and `compute_snap_extra` aggregator.
- `STRUCTURAL_GRAPHICS_SET` membership — `"g"` is still in the set.

## Empty-group fix (Phase 1)

`SnapSession`'s constructor filters 0-area rects from both agents and
neighbors. An empty `<g>` reports `getBBox() = {0,0,0,0}`; without
the filter the snap engine would align (0,0) edges to any neighbor
within threshold of the origin, producing a visible "jerk to origin"
the moment an empty group was dragged or appeared as a neighbor.
Degenerate lines (`width > 0 || height > 0`, e.g. a horizontal line
with `height = 0`) survive — they are valid snap targets on their
non-zero axis.

## Known caveats

These are properties of the snap engine, not bugs introduced by
descent. Listed honestly so users + maintainers know what to expect:

- **Stroke / filter / opacity-0 are excluded from rendered extent.**
  `getBBox()` returns the geometric bbox. A `<g stroke-width="10">`
  draws past its bbox edge; the snap guide lands on the underlying
  geometric edge, not the stroked edge.
- **AABB on rotated descendants.** A rotated `<rect>` inside a group
  surfaces an AABB anchor whose corners don't correspond to the
  visible rect corners. Descent makes this more visible (more
  rotated leaves exposed), but the underlying engine limit is the
  same.
- **Clip-path is not respected.** Clipped content's full geometric
  bbox is the snap target; the snap guide can land beyond the
  clipped extent.
- **`<text>` bbox depends on font load.** Mid-drag font swap can
  shift a snap target. Vanishingly rare.
- **Multi-select translate picks one delta.** When dragging multiple
  groups, one alignment wins and the others come along on that
  delta. Not group-specific; true for all multi-id translates.
- **One delta per frame across all descendants.** Many anchors
  contribute candidates, but exactly one snap fires per frame. The
  "best" leaf (per cmath's lexicographic 9-point lockin) wins; the
  group still translates as a rigid unit.
- **Resize-snap is not affected.** Resize gestures are still
  no-snap. See `TODO.md` §6 "Still open — Resize snap" — separate
  future work.
- **`<use>` is treated as opaque**: its own bbox participates, no
  descent into the referenced symbol. Revisit if/when symbol
  editing lands.

## Performance

A 100-leaf agent against a 100-leaf neighbor under naive O(N×M) would
cost ~10,000 candidate alignments per frame. In practice
`SnapSession.snap()` unions agent rects into a single envelope before
running cmath, and the neighbor walker prunes with a per-axis
envelope reject before bbox compare.

**Measured** on the `__bench__/group-snap.bench.ts` stress fixture
(`100-leaf agent <g> × 100-leaf neighbor <g>`, agent sweeping across
the snap range so neighbors qualify):

| metric                                     | result   |
| ------------------------------------------ | -------- |
| `SnapSession.snap()` per frame, mean       | ~0.15 ms |
| `SnapSession.snap()` per frame, p99        | ~0.28 ms |
| `compute_neighborhood + snap_descent` open | ~0.05 ms |

p99 is **~14× under** the plan's 4ms-per-frame budget on the
worst-case stress fixture. The 60Hz frame budget (16ms) leaves
substantial headroom even on group-heavy docs. **No spatial prune
shipped; no `EditorStyle` opt-out flag.**

If a future change pushes this over budget, the cheapest mitigations
in order are:

1. Spatial-prune neighbors with a coarse grid before bbox compare.
2. Cap descent depth (rarely useful in practice — most groups are
   shallow).
3. Add `EditorStyle.snap_descend_groups` (default `true`) so hosts
   on extremely group-heavy docs can opt out.

Re-run the bench (`pnpm --filter @grida/svg-editor bench`) after any
change to `compute_neighborhood`, `snap_descent`, or
`SnapSession.snap()`.

## Files

- [`session.ts`](./session.ts) — `SnapSession`; zero-area filter
  lives here.
- [`neighborhood.ts`](./neighborhood.ts) — `compute_neighborhood`,
  `snap_descent`, `is_self_rendered`.
- [`../../dom.ts`](../../dom.ts) — `open_snap_session_for` does the
  agent-side `snap_descent` expansion.
- [`../../../__tests__/group-snap.test.ts`](../../../__tests__/group-snap.test.ts) —
  Phase 2 behavior assertions (descent + agent expansion + group-to-group
  alignment preserved + zero-area filter).
- [`../../../__tests__/group-snap-rendered.test.ts`](../../../__tests__/group-snap-rendered.test.ts) —
  visibility filter coverage.
