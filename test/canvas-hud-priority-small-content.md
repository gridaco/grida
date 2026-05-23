---
id: TC-CANVAS-HUD-001
title: HUD priority model for small-content selections
module: canvas
area: hud
tags: [hud, priority, handles, zoom, drag, resize, double-click]
status: untested
severity: high
date: 2026-05-15
updated: 2026-05-15
automatable: partial
covered_by:
  - packages/grida-canvas-hud/__tests__/selection-controls.test.ts
  - packages/grida-canvas-hud/__tests__/chrome-priority.test.ts
---

## Behavior

The `@grida/hud` package resolves interactable regions with two
mechanisms layered together:

1. **Perimeter geometry: a 9-slice negotiated partition.** Per axis, the
   1D run of length `axis_dim + 2 * extension` is split into
   `[corner | edge | corner]`. The side (edge) is higher-priority — it
   guarantees its minimum length first; corners take the remainder and
   shrink when constrained. The 4 corners and 4 edges in 2D form a
   strict 3×3 partition of the perimeter ring — **mutually exclusive,
   no overlaps**.

2. **Priority ladder** (lower wins) on each zone. Used to resolve the
   one remaining overlap that geometry can't avoid: the body straddles
   into the perimeter ring's inside-bbox half in comfortable mode.
   Priority is a numeric field, not iteration order.

Both mechanisms are derived from one principle:

> Each side strip guarantees at least `MIN_GUARANTEED_INTERACTIVE_DIM`
> of length along its parallel axis. The body / drag interior retains
> at least the same min on each axis. Corners give way (shrink in the
> perimeter; lose to body in priority) to keep these guarantees.

With defaults (`MIN_HIT_SIZE = 16`, `MIN_GUARANTEED_INTERACTIVE_DIM = 20`),
the negotiation has three phases per axis (with `total = axis_dim + 2*extension`):

| Phase       | Condition                 | Result                                       |
| ----------- | ------------------------- | -------------------------------------------- |
| Comfortable | `total >= 2*16 + 20 = 52` | corner = 16, edge = `total - 32`             |
| Squeezed    | `total >= 20`             | edge = 20 (min), corner = `(total - 20) / 2` |
| Tiny        | `total < 20`              | edge = total, corner = 0                     |

And the body promotion threshold is the same derived value:

`BODY_FLIP_THRESHOLD = MIN_GUARANTEED_INTERACTIVE_DIM + MIN_HIT_SIZE = 36`

Body promotes above corner when **any** axis is shorter than this.
Edge promotes above body in their interior overlap when its **parallel**
axis is shorter (so a narrow strip still resizes from the long side
instead of dragging).

A separate visibility threshold `MIN_CHROME_VISIBLE_SIZE` (12) governs
when knobs render; below it the body / translate zone remains hit-able
even though the knobs disappear.

Together these rules fix the regression where small selections had
their bodies fully covered by 16×16 corner hit-rects, AND give elongated
strips (e.g. 20×100, 200×20) the correct asymmetric perimeter — short
axis gets shrunken corners + min-length edge; long axis stays
comfortable.

**Invariants:**

- The body / drag zone is **always** hit-able on any selection ≥ 1 px,
  regardless of zoom. Even when chrome knobs are hidden.
- Resize handles (visible knobs) are visually rendered above
  `MIN_CHROME_VISIBLE_SIZE` and remain hit-able outside the body on small
  content (so the user can grab a knob from the strip that extends
  beyond the bbox).
- Double-click on the body zone enters content-edit; double-click on a
  resize knob enters resize-to-fit (per
  TC-CANVAS-RESIZE-002 legacy behavior). With the new ladder, on small
  content a double-click inside the visual bbox lands on body (text edit),
  not on a corner knob.
- HUD is purely mathematical — no DOM, no z-index. The priority is data
  on each region; the registry resolves overlaps by comparing priority
  values.

## Steps

Run against `http://localhost:3000/svg` (free-form SVG editor).

1. **Setup.** Load any SVG with at least one rectangle and one text node.
   Select one node.

2. **Comfortable size (bbox ≥ 36 px on both axes, ~zoom 100%+).** Verify:
   - Pointer-down in the visual center → drag translates.
   - Pointer-down on a corner knob → drag resizes from that corner.
   - Pointer-down on a side midpoint (away from corners) → drag resizes from that edge.

3. **Small square (bbox 12–36 px on both axes — both axes below threshold; the headline fix).** Verify:
   - Pointer-down in the visual interior → drag translates. **Before the fix, this would have started a resize.**
   - Double-click on a small text node → enters content-edit (caret appears). **Before the fix, this would have triggered resize-to-fit or done nothing.**
   - Pointer-down on a visible corner knob (the part sticking outside the visual bbox) → drag resizes from that corner.
   - Pointer-down on a side midpoint → resizes from the edge direction (side-over-corner promotion is active).

4. **Elongated strip (e.g. text at small zoom, 20×100 or 200×20 — only ONE axis below threshold).** Verify the per-axis policy:
   - Pointer-down in the visual interior → drag translates (body is promoted because at least one axis is short).
   - On a tall-narrow strip (W short, H fine): the top/bottom midpoints resize as edges (N/S promoted); the left/right edges behave normally (default priority).
   - On a wide-short strip (W fine, H short): mirror of the above — left/right edges promoted; top/bottom default.

5. **Tiny content (bbox < 12 px on both axes).** Verify:
   - Corner / edge / rotation knobs are not rendered.
   - Pointer-down inside the bbox → drag still works (translate).
   - Pointer-down outside the bbox → no action (no chrome to hit).

6. **Zoom back in.** All knobs reappear; priority returns to default mode.

## Notes

- Consolidates the legacy
  [`TC-CANVAS-RESIZE-002`](canvas-resize-handle-z-order-zoom.md)
  (side-vs-corner promotion) and
  [`TC-CANVAS-RESIZE-003`](canvas-resize-handle-visibility-threshold.md)
  (visibility threshold) into a single priority + negotiation model for
  the new `@grida/hud` package. The new implementation exports
  `MIN_GUARANTEED_INTERACTIVE_DIM`, `BODY_FLIP_THRESHOLD`,
  `MIN_CHROME_VISIBLE_SIZE`, and `negotiateAxis` from
  `@grida/hud/event/selection-controls.ts`. The perimeter ring is built
  as a 3×3 mutually-exclusive partition (no overlap among the 8 outer
  slices); the priority field only resolves the body↔perimeter overlap
  that survives the negotiation.

- The math is automated in
  `packages/grida-canvas-hud/__tests__/selection-controls.test.ts` and
  `packages/grida-canvas-hud/__tests__/chrome-priority.test.ts`. The
  pipeline test asserts by **stable label** (`"translate"`,
  `"resize_handle:nw"`, `"resize_edge:n"`, …) so refactoring the
  geometry won't churn assertions. The ephemeral derivation script
  `packages/grida-canvas-hud/__bench__/derive-thresholds.mjs` shows the
  math + probes scenarios; `MIN_GUARANTEED_INTERACTIVE_DIM` is the
  single tunable constant.

- The **principle** is the day-100 contract: priority-as-data, per-axis
  per-zone promotion derived from `MIN_GUARANTEED_INTERACTIVE_DIM +
MIN_HIT_SIZE`, body always hit-able. Bumping the dim is a values
  change; changing the per-axis policy or adding a tier is a model
  change requiring plan-level review.
