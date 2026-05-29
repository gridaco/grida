// HitRegistry — bedrock point-query mechanism.
//
// Stores `HUDObject<I>` values and answers screen-space point queries
// by priority (lower wins on overlap). Generic over the consumer-
// supplied intent type `I`; bedrock treats `I` opaquely — only the
// hit shape is interpreted here.
//
// Bedrock invariants:
//
//   - Objects whose `hit` is undefined are paint-only and are NEVER
//     returned by `queryPoint` / `queryAll`. They live in the
//     registry only if the consumer adds them (e.g., for a full
//     per-frame snapshot), but the query API filters them out.
//
//   - Priority is opaque to bedrock — just a sort key. Lower wins.
//     Consumers (e.g. selection's priority ladder) own the integer
//     scheme.
//
//   - Camera transform is supplied per query, not stored. The
//     registry is a pure data structure; the consumer owns the
//     camera (single source of truth = the consumer's draw loop).

import cmath from "@grida/cmath";
import type { HUDObject, HitShape } from "../primitives/overlay";
import { docToScreen, type Transform } from "./transform";

/**
 * Generic hit registry. One per frame (or persistent — bedrock is
 * agnostic). Add objects with `add`, clear with `clear`, query with
 * `queryPoint` / `queryAll`.
 */
export class HitRegistry<I = unknown> {
  private items: HUDObject<I>[] = [];

  /**
   * Add an object. Objects without `hit` are accepted (they may carry
   * paint information the consumer still wants in the registry for
   * uniform iteration) but are filtered from point queries.
   */
  add(obj: HUDObject<I>): void {
    this.items.push(obj);
  }

  /** Drop all entries. */
  clear(): void {
    this.items = [];
  }

  /** Total number of stored objects (paint-only + hit-testable). */
  size(): number {
    return this.items.length;
  }

  /** Iterate every stored object in insertion order. */
  *entries(): IterableIterator<HUDObject<I>> {
    for (const o of this.items) yield o;
  }

  /**
   * Return the hit-testable object whose hit shape contains the
   * given screen-space point with the lowest `priority` value
   * (lower wins). Paint-only objects (no `hit`) are skipped.
   */
  queryPoint(
    point_screen: cmath.Vector2,
    transform: Transform
  ): HUDObject<I> | null {
    let best: HUDObject<I> | null = null;
    let best_priority = Number.POSITIVE_INFINITY;
    for (const obj of this.items) {
      if (!obj.hit) continue;
      // Strictly-greater is skipped; EQUAL priority is NOT skipped, so a
      // later-added object at the same priority replaces the earlier one
      // ("later push wins on tie" — preserves the legacy `HitRegions`
      // topmost-on-overlap feel).
      if (obj.priority > best_priority) continue;
      if (!shapeContains(obj.hit, point_screen, transform)) continue;
      if (obj.refine && !obj.refine(point_screen)) continue;
      best = obj;
      best_priority = obj.priority;
    }
    return best;
  }

  /**
   * Return all hit-testable objects whose hit shape contains the point,
   * winner first. Ordering is identical to `queryPoint`'s arbitration:
   * priority ascending (lower wins), and on EQUAL priority the
   * later-added object comes first ("later push wins on tie"). This makes
   * `queryAll(p)[0]` always equal `queryPoint(p)` — the two query paths
   * never disagree on the winner.
   */
  queryAll(point_screen: cmath.Vector2, transform: Transform): HUDObject<I>[] {
    const matches: { obj: HUDObject<I>; i: number }[] = [];
    for (let i = 0; i < this.items.length; i++) {
      const obj = this.items[i];
      if (!obj.hit) continue;
      if (!shapeContains(obj.hit, point_screen, transform)) continue;
      // Honour `refine` symmetrically with `queryPoint` — otherwise the
      // two query paths disagree on curve-refined shapes (bbox match vs
      // on-curve match).
      if (obj.refine && !obj.refine(point_screen)) continue;
      matches.push({ obj, i });
    }
    // Priority ascending; tie broken by DESCENDING insertion index so the
    // later-added object wins a tie — matching `queryPoint`.
    matches.sort((a, b) => a.obj.priority - b.obj.priority || b.i - a.i);
    return matches.map((m) => m.obj);
  }
}

// ─── shape containment ────────────────────────────────────────────────────

/**
 * Test whether a screen-space point lies inside a `HitShape`.
 *
 * The camera `transform` is needed for doc-anchored shapes
 * (`screen_rect_at_doc`, `screen_circle_at_doc`); pre-projected
 * shapes (`screen_aabb`, `screen_polygon`) ignore it. `screen_obb`
 * applies its own `inverse_transform`, which maps screen → shadow
 * (independent of the camera).
 */
export function shapeContains(
  shape: HitShape,
  point_screen: cmath.Vector2,
  transform: Transform
): boolean {
  const [px, py] = point_screen;
  switch (shape.kind) {
    case "screen_rect_at_doc": {
      const [ax, ay] = docToScreen(
        transform,
        shape.anchor_doc[0],
        shape.anchor_doc[1]
      );
      const { x, y } = anchorOrigin(
        ax,
        ay,
        shape.width,
        shape.height,
        shape.placement ?? "center"
      );
      return (
        px >= x && px <= x + shape.width && py >= y && py <= y + shape.height
      );
    }
    case "screen_aabb": {
      const r = shape.rect;
      return (
        px >= r.x && px <= r.x + r.width && py >= r.y && py <= r.y + r.height
      );
    }
    case "screen_obb": {
      // Apply inverse_transform to map screen → shadow, then AABB test.
      const [[a, b, e], [c, d, f]] = shape.inverse_transform;
      const sx = a * px + b * py + e;
      const sy = c * px + d * py + f;
      const r = shape.rect;
      return (
        sx >= r.x && sx <= r.x + r.width && sy >= r.y && sy <= r.y + r.height
      );
    }
    case "screen_circle_at_doc": {
      const [ax, ay] = docToScreen(
        transform,
        shape.anchor_doc[0],
        shape.anchor_doc[1]
      );
      const dx = px - ax;
      const dy = py - ay;
      return dx * dx + dy * dy <= shape.radius * shape.radius;
    }
    case "screen_polygon": {
      return pointInPolygon(point_screen, shape.points);
    }
  }
}

function anchorOrigin(
  ax: number,
  ay: number,
  w: number,
  h: number,
  placement: "center" | "tl" | "tr" | "bl" | "br"
): { x: number; y: number } {
  switch (placement) {
    case "center":
      return { x: ax - w / 2, y: ay - h / 2 };
    case "tl":
      return { x: ax, y: ay };
    case "tr":
      return { x: ax - w, y: ay };
    case "bl":
      return { x: ax, y: ay - h };
    case "br":
      return { x: ax - w, y: ay - h };
  }
}

/**
 * Standard even-odd ray-cast point-in-polygon.
 *
 * Horizontal edges (`yi === yj`) are skipped — the standard idiom for
 * the even-odd algorithm. (The previous form used `(yj - yi ||
 * Number.EPSILON)` as a divide-by-zero guard, but the guard was dead
 * code: the `yi > py !== yj > py` clause already short-circuits to
 * `false` when the edge is horizontal, so the division never runs.)
 */
function pointInPolygon(
  point: cmath.Vector2,
  poly: ReadonlyArray<readonly [number, number]>
): boolean {
  const [px, py] = point;
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi === yj) continue; // horizontal edge — even-odd skips
    const intersect =
      yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}
