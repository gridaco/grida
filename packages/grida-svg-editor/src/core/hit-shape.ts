// Fat-hit picker — the logic container.
//
// Pure: no DOM, no document IR, no editor types. Reusable as-is against
// any backend that can produce a `HitShape` and bounds per id. The SVG
// document adapter lives in `./hit-shape-svg.ts`; the DOM-coupled
// wiring that composes that adapter with live `bounds_of` lives in
// `dom.ts` (`SvgHitShapeDriver`).
//
// If you're picking up this module cold, read `docs/wg/feat-svg-editor/hit-test.md` first.
// It covers what works, what doesn't, and what v2 should look like.

import cmath from "@grida/cmath";
import type { NodeId, Rect, Unsubscribe, Vec2 } from "../types";

// ─── Types ──────────────────────────────────────────────────────────────────

/**
 * Geometry the picker tests against. One variant per shape-bearing SVG
 * element; tags without an intrinsic shape (text, image, use, groups)
 * are expressed by callers as bounds-rect via the `rect` kind.
 *
 *   - `rect`     — `<rect>` (axis-aligned).
 *   - `ellipse`  — `<circle>` and `<ellipse>` (rx may equal ry).
 *   - `segment`  — `<line>`.
 *   - `polyline` — `<polyline>` (open chain).
 *   - `polygon`  — `<polygon>` (closed ring; distance is to the edges).
 *   - `path`     — `<path>`, approximated as a control polyline (see
 *                  `path_control_polyline` in `./hit-shape-svg.ts`).
 */
export type HitShape =
  | { kind: "rect"; x: number; y: number; width: number; height: number }
  | { kind: "ellipse"; cx: number; cy: number; rx: number; ry: number }
  | { kind: "segment"; a: Vec2; b: Vec2 }
  | { kind: "polyline"; pts: Vec2[]; closed: false }
  | { kind: "polygon"; pts: Vec2[]; closed: true }
  | { kind: "path"; pts: Vec2[]; closed: boolean };

/**
 * Per-node hit-shape lookup. Implementations may cache; the
 * `MemoizedHitShapeProvider` below is the standard wrapper.
 *
 * `null` means "no shape derivable" — pickers typically skip the
 * candidate or fall back to a bounds-rect (the SvgHitShapeDriver in
 * dom.ts does the latter for non-transparent tags).
 */
export interface HitShapeDriver {
  hit_shape_of(id: NodeId): HitShape | null;
}

/** Cache invalidation signals — same shape as `GeometrySignals` in
 *  `core/geometry.ts`. Wire to the editor's `structure_version` /
 *  `geometry_version` counters. */
export type HitShapeSignals = {
  subscribe_structure: (cb: () => void) => Unsubscribe;
  subscribe_geometry: (cb: () => void) => Unsubscribe;
};

// ─── Distance math ──────────────────────────────────────────────────────────

/**
 * Shortest distance from world-space `p` to `shape`. Returns `0` for
 * points strictly inside a filled region (rect / ellipse / polygon
 * interior); the picker treats this as "inside the fill" — an exact
 * hit, no tolerance required.
 *
 * For `path`, this is *edge* distance (no interior test). v1 doesn't
 * model winding-rule fill regions for paths; see docs/wg/feat-svg-editor/hit-test.md.
 */
export function point_distance_to_shape(p: Vec2, shape: HitShape): number {
  const pv: cmath.Vector2 = [p.x, p.y];
  switch (shape.kind) {
    case "rect": {
      const r = {
        x: shape.x,
        y: shape.y,
        width: shape.width,
        height: shape.height,
      };
      if (cmath.rect.containsPoint(r, pv)) return 0;
      const [dx, dy] = cmath.rect.offset(r, pv);
      return Math.hypot(dx, dy);
    }
    case "ellipse": {
      // No closed-form distance for ellipses. Use radial-scale: map the
      // point into unit-circle space; signed distance to the unit circle
      // is a tight enough proxy for tolerance thresholds.
      if (shape.rx <= 0 || shape.ry <= 0) {
        return Math.hypot(p.x - shape.cx, p.y - shape.cy);
      }
      const nx = (p.x - shape.cx) / shape.rx;
      const ny = (p.y - shape.cy) / shape.ry;
      const r_norm = Math.hypot(nx, ny);
      if (r_norm <= 1) return 0;
      return (r_norm - 1) * Math.min(shape.rx, shape.ry);
    }
    case "segment":
      return cmath.segment.point_distance(
        pv,
        [shape.a.x, shape.a.y],
        [shape.b.x, shape.b.y]
      );
    case "polyline":
      return cmath.polyline.point_distance(
        pv,
        shape.pts.map((q) => [q.x, q.y] as cmath.Vector2),
        false
      );
    case "polygon": {
      const ring = shape.pts.map((q) => [q.x, q.y] as cmath.Vector2);
      if (ring.length >= 3 && cmath.polygon.pointInPolygon(pv, ring)) {
        return 0;
      }
      return cmath.polyline.point_distance(pv, ring, true);
    }
    case "path":
      return cmath.polyline.point_distance(
        pv,
        shape.pts.map((q) => [q.x, q.y] as cmath.Vector2),
        shape.closed
      );
  }
}

// ─── Picker (z-ordered tolerance walk) ─────────────────────────────────────

/** Options for {@link pick_at_world}. Picker is purely world-space; the
 *  caller is responsible for screen→world conversion of both the click
 *  point and the tolerance (`tolerance_screen / camera.zoom`). */
export type PickOptions = {
  tolerance_world: number;
  /** Candidates in paint order (back→front). The picker walks them
   *  topmost-first to match SVG paint order. */
  ordered_ids: ReadonlyArray<NodeId>;
  bounds_of: (id: NodeId) => Rect | null;
  hit_shape_of: (id: NodeId) => HitShape | null;
};

/**
 * Topmost node within `tolerance_world` of `p`. Returns `null` if no
 * candidate qualifies.
 *
 * Algorithm:
 *   1. Walk `ordered_ids` topmost-first.
 *   2. AABB pre-filter via `cmath.rect.pad(bounds_of(id), tolerance)`.
 *   3. Distance check via `point_distance_to_shape`.
 *   4. First candidate with `dist <= tolerance` wins.
 *
 * Candidates whose `hit_shape_of` returns `null` are skipped. Candidates
 * whose `bounds_of` returns `null` are skipped.
 */
export function pick_at_world(p: Vec2, opts: PickOptions): NodeId | null {
  const { tolerance_world, ordered_ids, bounds_of, hit_shape_of } = opts;
  const pv: cmath.Vector2 = [p.x, p.y];
  for (let i = ordered_ids.length - 1; i >= 0; i--) {
    const id = ordered_ids[i];
    const bounds = bounds_of(id);
    if (!bounds) continue;
    const inflated = cmath.rect.pad(bounds, tolerance_world);
    if (!cmath.rect.containsPoint(inflated, pv)) continue;
    const shape = hit_shape_of(id);
    if (!shape) continue;
    if (point_distance_to_shape(p, shape) <= tolerance_world) return id;
  }
  return null;
}

// ─── Memoizer (cache invalidated by signals) ───────────────────────────────

/** Caches `hit_shape_of` results keyed on NodeId; full-clears on either
 *  `structure_version` or `geometry_version` bump. Mirror of
 *  `MemoizedGeometryProvider` in `core/geometry.ts`. */
export class MemoizedHitShapeProvider implements HitShapeDriver {
  private readonly driver: HitShapeDriver;
  private readonly unsubscribers: Unsubscribe[] = [];
  private cache = new Map<NodeId, HitShape | null>();

  constructor(driver: HitShapeDriver, signals: HitShapeSignals) {
    this.driver = driver;
    const invalidate = () => this.cache.clear();
    this.unsubscribers.push(signals.subscribe_structure(invalidate));
    this.unsubscribers.push(signals.subscribe_geometry(invalidate));
  }

  hit_shape_of(id: NodeId): HitShape | null {
    if (this.cache.has(id)) return this.cache.get(id) ?? null;
    const s = this.driver.hit_shape_of(id);
    this.cache.set(id, s);
    return s;
  }

  dispose(): void {
    for (const unsub of this.unsubscribers) unsub();
    this.unsubscribers.length = 0;
    this.cache.clear();
  }
}
