---
id: TC-SVGEDITOR-RESIZE-002
title: Shift + side-edge resize keeps the aspect ratio (uniform about the opposite-edge center)
module: svg-editor
area: resize
tags: [resize, hud, aspect-lock, shift, modifiers]
status: untested
severity: medium
date: 2026-06-18
updated: 2026-06-18
automatable: true
covered_by:
  - packages/grida-svg-editor/__tests__/resize-aspect-edge.test.ts
  - packages/grida-canvas-hud/__tests__/apply-resize-aspect.test.ts
---

## Behavior

Holding **Shift** while dragging a **side-edge** handle (N / S / E / W)
resizes the element **uniformly** — the perpendicular axis scales by the
same factor as the dragged axis, so the aspect ratio is preserved. The
anchor is the **opposite side's center**: dragging the E edge pins the
left edge and grows the box symmetrically above and below the horizontal
centerline; dragging the N edge pins the bottom edge and grows
symmetrically left and right of the vertical centerline.

This matches the long-standing **corner** behavior (Shift on a corner is
max-magnitude uniform) and composes with **Alt** (from-center) →
Shift+Alt is uniform about the bbox center.

The logic is entirely in the headless core: the modifier `aspect_lock:
"uniform"` (mapped from Shift in `dom.ts`) is carried on the resize plan
and consumed by `compute_factors`' edge arms. The corner path is
unchanged — it still carries the lock as rewritten deltas via the
`aspect_lock` stage, so corner gestures are byte-identical to before.

## Steps

Open the SVG editor demo at `http://localhost:3000/svg/` (or
`/svg/examples/default`). Pick a `<rect>` with a non-square aspect ratio
(e.g. 100×50).

1. **East edge + Shift.** Select the rect, hold **Shift**, drag the E
   (right-middle) handle outward, release.
   - Expected: width grows; height grows proportionally; the **left
     edge stays put**; top and bottom move symmetrically (vertical
     center fixed). The dashed preview tracks the squared result with
     no lag.

2. **North edge + Shift.** Drag the N (top-middle) handle upward with
   Shift held.
   - Expected: height grows upward; width grows proportionally; the
     **bottom edge stays put**; left and right move symmetrically.

3. **Shift+Alt edge.** Drag the E handle with **Shift+Alt** held.
   - Expected: uniform scale about the bbox **center** — all four edges
     move, the center stays fixed, aspect ratio preserved.

4. **Mid-drag toggle.** Start an E-edge drag, then press/release Shift
   without moving the pointer.
   - Expected: the preview re-squares (Shift down) / returns to free
     (Shift up) immediately, not on the next move.

5. **Corner unchanged.** Shift-drag a corner handle.
   - Expected: identical to prior behavior (max-magnitude uniform);
     the dashed preview is now tight against the result.

## Notes

The dashed-preview parity (`applyResize` / `resizePreviewShape` in
`@grida/hud`) also fixes a pre-existing latent lag where the corner
Shift preview did not square up. The unit suites in `covered_by` drive
the core `compute_factors` / orchestrator and the HUD `applyResize`
math; this TC verifies the real pointer → HUD → core chain on top.
