// Contract test for the snap engine + adapter split.
//
// SnapSession is intentionally rectangle-only and frame-agnostic. The
// caller picks the frame; the engine just aligns AABB edges. So the
// engine's behavior depends entirely on what rects the adapter feeds it.
//
// Historical bug: the host adapter fed each element's `bbox_local`
// (= `getBBox()`), which per SVG 2 §4.6.4 is the element's own
// pre-transform user coordinate system. The engine then treated those
// local edges as if they were doc-space and fired snap at the wrong
// visual position whenever an element had a rotate transform. Fixed by
// routing through `bbox_world` (= `bbox_local` projected through the
// element's own `transform=`) in dom.ts. See `src/core/transform/project.ts`.
//
// These tests pin the engine's behavior under BOTH frames so the
// adapter's choice is documented and a future regression can't silently
// route the wrong rects in.

import { describe, expect, it } from "vitest";
import {
  DEFAULT_SNAP_OPTIONS,
  SnapSession,
  type SnapOptions,
} from "../src/core/snap";
import type { Rect } from "../src/types";

const opts: SnapOptions = { ...DEFAULT_SNAP_OPTIONS, threshold_px: 5 };

/** Doc-space AABB of a rect's four corners after applying `rotate(θ cx cy)`.
 *  This is what the user SEES — the tight axis-aligned envelope of the
 *  rotated rendered rect in the root SVG's user-coordinate system. */
function rotated_aabb(
  local: Rect,
  pivot: { x: number; y: number },
  theta_deg: number
): Rect {
  const t = (theta_deg * Math.PI) / 180;
  const cos = Math.cos(t);
  const sin = Math.sin(t);
  const corners = [
    { x: local.x, y: local.y },
    { x: local.x + local.width, y: local.y },
    { x: local.x + local.width, y: local.y + local.height },
    { x: local.x, y: local.y + local.height },
  ];
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const c of corners) {
    const dx = c.x - pivot.x;
    const dy = c.y - pivot.y;
    const wx = pivot.x + dx * cos - dy * sin;
    const wy = pivot.y + dx * sin + dy * cos;
    if (wx < minX) minX = wx;
    if (wy < minY) minY = wy;
    if (wx > maxX) maxX = wx;
    if (wy > maxY) maxY = wy;
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

describe("snap engine behavior under local-frame vs doc-space rects", () => {
  // Fixture: a 100×100 rect rotated 45° around its own center.
  // Local box (what `getBBox()` returns):
  const ROT_LOCAL: Rect = { x: 0, y: 0, width: 100, height: 100 };
  const ROT_PIVOT = { x: 50, y: 50 };
  const ROT_ANGLE_DEG = 45;
  // Doc-space AABB (what the user sees):
  const ROT_VISIBLE = rotated_aabb(ROT_LOCAL, ROT_PIVOT, ROT_ANGLE_DEG);
  //   → x = 50 - 70.71… = -20.71…
  //   → width = 141.42… (the diagonal length, as expected for a 45° square)

  // Neighbor: axis-aligned, far to the right. Its left edge is at x=200.
  // Vertical position is offset so the rotated rect's local `y` doesn't
  // incidentally share an edge with the neighbor on the y axis — the
  // tests below isolate x-axis snap behavior.
  const NEIGHBOR: Rect = { x: 200, y: 500, width: 60, height: 60 };

  it("sanity: visible AABB ≠ local frame for a rotated rect", () => {
    expect(ROT_VISIBLE.x).toBeCloseTo(-20.7107, 3);
    expect(ROT_VISIBLE.x + ROT_VISIBLE.width).toBeCloseTo(120.7107, 3);
    // Local frame: 0 .. 100. Visible: -20.71 .. 120.71. Diverges by ~20.71
    // on each side — the rotated rect extends past its local box.
    expect(ROT_LOCAL.x).not.toBeCloseTo(ROT_VISIBLE.x, 1);
    expect(ROT_LOCAL.x + ROT_LOCAL.width).not.toBeCloseTo(
      ROT_VISIBLE.x + ROT_VISIBLE.width,
      1
    );
  });

  it("when fed local-frame rects: engine aligns local edges (wrong for user's gesture)", () => {
    // Pre-fix the host adapter fed each agent's / neighbor's `bbox_local`
    // (= getBBox) as if it were already in world space. This pins the
    // engine's behavior under that input so a regression that re-introduces
    // the local-frame leak shows up here.
    const session = new SnapSession({
      agents: [ROT_LOCAL],
      neighbors: [NEIGHBOR],
    });
    // User drags the visible (rotated) rect rightward. The cumulative
    // delta to make the visible right edge (at doc-x ≈ 120.71) touch the
    // neighbor's left edge (at doc-x = 200) is ≈ 79.29.
    const visible_touching_delta =
      NEIGHBOR.x - (ROT_VISIBLE.x + ROT_VISIBLE.width);
    expect(visible_touching_delta).toBeCloseTo(79.2893, 3);
    // But the engine sees the LOCAL box (right edge at x=100). To make
    // local right (100) touch neighbor left (200), it wants delta = 100.
    // Feed a delta that's "near" the local snap zone but FAR from the
    // visible snap zone:
    const r = session.snap({ x: 96, y: 0 }, opts);
    // Snap fires (local right at 96+100=196, neighbor left at 200,
    // within threshold 5) → corrected delta x = 100.
    expect(r.delta.x).toBeCloseTo(100, 4);
    expect(r.guide).toBeDefined();
    // At the corrected delta (x = 100), the VISIBLE right edge is now at
    // doc-x = 120.71 + 100 = 220.71 — 20.71 PAST the neighbor's left edge.
    // The user's rotated rect visually overshoots / overlaps the neighbor.
  });

  it("snap does NOT fire at the user's visual-touch delta (current behavior)", () => {
    const session = new SnapSession({
      agents: [ROT_LOCAL],
      neighbors: [NEIGHBOR],
    });
    // User drags to the position where their visible right edge touches
    // the neighbor's left edge — visible_touching_delta ≈ 79.29.
    const r = session.snap({ x: 79.29, y: 0 }, opts);
    // The engine sees local right at 100 + 79.29 = 179.29. Distance to
    // neighbor left (200) is 20.71 — well past threshold (5). No snap
    // fires. The user gets no haptic / no guide where they expected one.
    expect(r.delta.x).toBeCloseTo(79.29, 2);
    expect(r.guide).toBeUndefined();
  });

  it("when fed doc-space AABB rects: engine aligns visible edges (the fix's contract)", () => {
    // What the host adapter does post-fix: project each element's
    // `getBBox()` through its own `transform=` via
    // `src/core/transform/project.ts` `project_local_bbox`, then feed
    // the projected AABB. Snap aligns the visible envelope.
    const session = new SnapSession({
      agents: [ROT_VISIBLE],
      neighbors: [NEIGHBOR],
    });
    // User drags toward neighbor; delta ≈ 79.29 brings the visible right
    // edge to touch neighbor left. The engine now sees the agent's right
    // edge at the visible position (120.71), so post-delta right is
    // 120.71 + 79.29 = 200, which equals the neighbor's left within zero
    // tolerance. Snap fires; delta is unchanged (already aligned).
    const r = session.snap({ x: 79.2893, y: 0 }, opts);
    expect(r.delta.x).toBeCloseTo(79.2893, 3);
    expect(r.guide).toBeDefined();

    // And feeding a delta that would now misalign the visible right edge
    // does not fire spurious snap:
    const r2 = session.snap({ x: 100, y: 0 }, opts);
    // Visible right at delta 100 is 220.71 — 20.71 past neighbor left,
    // outside threshold. Engine snaps it back to align: corrected delta
    // would bring visible right to exactly 200, i.e. delta = 79.29.
    // Within the configured threshold (5), snap re-corrects to that.
    // Here delta=100 is 20.71 away from the snap zone → outside
    // threshold → no correction. Note: this is the SAME behavior the
    // user would mentally expect — snap fires near visible alignment,
    // not near local alignment.
    expect(r2.delta.x).toBeCloseTo(100, 4);
  });

  it("AABB-of-rotated is still not the artwork's true edges (residual limitation)", () => {
    // Even if we feed the doc-space AABB, the agent is treated as a
    // rectangle. A 45°-rotated square's true visible edges are diagonal
    // lines, not vertical / horizontal lines — its AABB is a loose
    // envelope. So even the counterfactual above is an approximation.
    // True edge snapping would require feeding the rotated polygon's
    // four edges as line-anchors, which the engine does not support.
    // docs/wg/feat-svg-editor/feedback-transform.md §🟡 / element-ir.md §12 track this as the
    // snap engine refactor; the IR exposes `polygon_in_doc_space()` so
    // the snap engine can consume it once refactored.
    const visible_w = ROT_VISIBLE.width;
    const local_w = ROT_LOCAL.width;
    expect(visible_w).toBeGreaterThan(local_w); // AABB is larger
    expect(visible_w).toBeCloseTo(Math.SQRT2 * local_w, 3);
    // True edge length is still `local_w` (the rect's side length), but
    // the AABB pretends the rotated rect is `√2 × local_w` wide. So the
    // visible AABB OVER-snaps relative to the diagonal silhouette — but
    // still much better than the local-frame leak above.
  });
});
