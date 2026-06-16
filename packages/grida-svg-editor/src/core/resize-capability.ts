// Per-element resize semantics. Internal seam (P3 in README): SVG's ~20
// element kinds resize differently — circle is uniform-only, text is
// uniform-on-corner-only, edges no-op on text, etc. This module exposes
// the constraint as a pure function so the snap stage can ask "what rect
// would the attribute write actually produce?" *before* writing, instead
// of snapping on the gesture-proposed rect and watching `apply_resize`
// move the rect somewhere else after the fact.
//
// Editor-agnostic — no document, DOM, or editor type. Operates on the
// `ResizeBaseline` already captured by `intents.ts`.

import type { Rect, Vec2 } from "../types";
import type {
  ResizeBaseline,
  ResizeDirection,
} from "./resize-pipeline/resize-pipeline";

/** Result of applying the element-driven constraint to a gesture's
 *  proposed `(sx, sy)`. */
export type ResizeConstraint = {
  /** Constrained scale factors. For free elements this is identity;
   *  for circle / text-on-corner this is `(s, s)` with
   *  `s = min(sx, sy)`. */
  sx: number;
  sy: number;
  /** True when the gesture has no visible effect (text-on-edge). */
  no_op: boolean;
  /** True when the constraint forces `sx === sy` (circle, text-on-
   *  corner). */
  uniform: boolean;
};

/** Direction-only metadata: which axes does this handle affect, and
 *  which edges of the bbox are "moving" for snap. Independent of the
 *  element type. */
export type DirectionMask = {
  affects_x: boolean;
  affects_y: boolean;
  /** The moving x edge of the bbox during this drag. `null` for N/S
   *  edges (x is fixed). */
  x_edge: "left" | "right" | null;
  /** The moving y edge of the bbox during this drag. `null` for E/W
   *  edges. */
  y_edge: "top" | "bottom" | null;
};

/** Snap target / effective view of a resize gesture: the post-constraint
 *  axis-aligned rect plus the constrained scale factors and a moving-
 *  edge description for the snap stage. */
export type EffectiveResize = {
  rect: Rect;
  /** Post-constraint scale factors (== gesture for free elements;
   *  uniform for circle / text-on-corner; `(1, 1)` for text-on-edge no-
   *  op). */
  sx: number;
  sy: number;
  /** Position of the moving corner / edge midpoint after constraint. */
  moving_corner: Vec2;
  /** Fixed-anchor corner the resize pivots around. */
  origin: Vec2;
  no_op: boolean;
  uniform: boolean;
  mask: DirectionMask;
};

export namespace resize_capability {
  export function direction_mask(dir: ResizeDirection): DirectionMask {
    const has_n = dir === "n" || dir === "ne" || dir === "nw";
    const has_s = dir === "s" || dir === "se" || dir === "sw";
    const has_e = dir === "e" || dir === "ne" || dir === "se";
    const has_w = dir === "w" || dir === "nw" || dir === "sw";
    return {
      affects_x: has_e || has_w,
      affects_y: has_n || has_s,
      x_edge: has_e ? "right" : has_w ? "left" : null,
      y_edge: has_n ? "top" : has_s ? "bottom" : null,
    };
  }

  /** Is this direction one of the four corners (vs. an edge handle)? */
  export function is_corner(dir: ResizeDirection): boolean {
    return dir === "nw" || dir === "ne" || dir === "se" || dir === "sw";
  }

  /**
   * Apply per-element resize constraints to a gesture's proposed
   * `(sx, sy)`.
   *
   * The constraint mirrors `apply_resize` exactly so that the
   * *effective rect* the caller computes from `(sx, sy)` matches what
   * attribute writes actually produce. This is the keystone of resize
   * snap: snapping on the gesture-proposed rect would lie about where
   * the geometry lands when an element-type constraint kicks in.
   *
   * Constraints:
   *   - `rect` / `image` / `use` / `ellipse` / `line` / `polyline` /
   *     `polygon` / `path`: free per-axis. Identity.
   *   - `circle`: uniform. `s = min(sx, sy)`.
   *   - `text`: uniform on corner drags; no-op on edge drags. Mirrors
   *     the `isCorner = sx !== 1 && sy !== 1` check in `apply_resize`.
   *   - `unsupported`: no-op.
   */
  export function constraint(
    baseline: ResizeBaseline,
    dir: ResizeDirection,
    sx_gesture: number,
    sy_gesture: number
  ): ResizeConstraint {
    const kind = baseline.attrs.kind;
    switch (kind) {
      case "rect":
      case "image":
      case "use":
      case "ellipse":
      case "line":
      case "polyline":
      case "polygon":
      case "path":
        return {
          sx: sx_gesture,
          sy: sy_gesture,
          no_op: false,
          uniform: false,
        };
      case "circle": {
        const s = Math.min(sx_gesture, sy_gesture);
        return { sx: s, sy: s, no_op: false, uniform: true };
      }
      case "text": {
        if (!is_corner(dir)) {
          return { sx: 1, sy: 1, no_op: true, uniform: true };
        }
        const s = Math.min(sx_gesture, sy_gesture);
        return { sx: s, sy: s, no_op: false, uniform: true };
      }
      case "unsupported":
        return { sx: 1, sy: 1, no_op: true, uniform: false };
    }
  }

  /** Position of a bbox corner / edge midpoint by direction. */
  export function corner_of_rect(r: Rect, dir: ResizeDirection): Vec2 {
    switch (dir) {
      case "nw":
        return { x: r.x, y: r.y };
      case "n":
        return { x: r.x + r.width / 2, y: r.y };
      case "ne":
        return { x: r.x + r.width, y: r.y };
      case "e":
        return { x: r.x + r.width, y: r.y + r.height / 2 };
      case "se":
        return { x: r.x + r.width, y: r.y + r.height };
      case "s":
        return { x: r.x + r.width / 2, y: r.y + r.height };
      case "sw":
        return { x: r.x, y: r.y + r.height };
      case "w":
        return { x: r.x, y: r.y + r.height / 2 };
    }
  }

  /** The fixed-origin corner for a drag (opposite the moving corner). */
  export function origin_of_direction(r: Rect, dir: ResizeDirection): Vec2 {
    switch (dir) {
      case "nw":
        return { x: r.x + r.width, y: r.y + r.height };
      case "n":
        return { x: r.x + r.width / 2, y: r.y + r.height };
      case "ne":
        return { x: r.x, y: r.y + r.height };
      case "e":
        return { x: r.x, y: r.y + r.height / 2 };
      case "se":
        return { x: r.x, y: r.y };
      case "s":
        return { x: r.x + r.width / 2, y: r.y };
      case "sw":
        return { x: r.x + r.width, y: r.y };
      case "w":
        return { x: r.x + r.width, y: r.y + r.height / 2 };
    }
  }

  /**
   * Compute the effective rect that `apply_resize` would write for the
   * given gesture. This is what snap operates on.
   *
   * The rect is computed by scaling `baseline.bbox` around `origin` by
   * the constrained `(sx, sy)`. For free elements this matches the
   * gesture exactly; for circle / text-on-corner it collapses to a
   * uniform-scale rect; for text-on-edge it returns the baseline rect
   * unchanged.
   */
  export function effective(
    baseline: ResizeBaseline,
    dir: ResizeDirection,
    sx_gesture: number,
    sy_gesture: number,
    from_center = false
  ): EffectiveResize {
    const bbox = baseline.bbox;
    // Alt: pivot on the bbox center instead of the opposite corner, so
    // the effective rect / moving corner / origin the snap stage reads
    // match what the center-aware `apply` will actually write.
    const origin = from_center
      ? { x: bbox.x + bbox.width / 2, y: bbox.y + bbox.height / 2 }
      : origin_of_direction(bbox, dir);
    const c = constraint(baseline, dir, sx_gesture, sy_gesture);
    const mask = direction_mask(dir);

    // Scale the bbox around `origin` by (c.sx, c.sy). Width/height stay
    // positive by construction since `compute_resize_factors` floors at
    // 0.001 — we don't re-clamp here.
    const new_x = origin.x + (bbox.x - origin.x) * c.sx;
    const new_y = origin.y + (bbox.y - origin.y) * c.sy;
    const new_w = bbox.width * c.sx;
    const new_h = bbox.height * c.sy;
    const rect: Rect = { x: new_x, y: new_y, width: new_w, height: new_h };
    const moving_corner = corner_of_rect(rect, dir);

    return {
      rect,
      sx: c.sx,
      sy: c.sy,
      moving_corner,
      origin,
      no_op: c.no_op,
      uniform: c.uniform,
      mask,
    };
  }
}
