import cmath from "@grida/cmath";
import type { ResizeDirection, RotationCorner } from "./cursor";

/**
 * Rect type local to the event/ layer.
 *
 * Mirrors `cmath.Rectangle` shape; declared here to keep `event/` free of
 * imports beyond `cmath` types.
 */
export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type NodeId = string;

/**
 * Active interaction state for the surface.
 *
 * Coordinates inside each variant are documented per-field. The surface
 * stores anchor points in document-space (so they survive camera pans during
 * a gesture); incremental deltas are computed against the anchor each move.
 */
export type SurfaceGesture =
  | { kind: "idle" }
  | {
      kind: "pan";
      /** Last screen-space pointer position. */
      prev_screen: cmath.Vector2;
    }
  | {
      kind: "marquee";
      /** Anchor (pointer-down) in document-space. */
      anchor_doc: cmath.Vector2;
      /** Current pointer in document-space. */
      current_doc: cmath.Vector2;
    }
  | {
      kind: "translate";
      /** Selected ids at the start of the gesture. */
      ids: NodeId[];
      /** Anchor (pointer-down) in document-space. */
      anchor_doc: cmath.Vector2;
      /** Last reported pointer in document-space. */
      last_doc: cmath.Vector2;
    }
  | {
      kind: "resize";
      /** Member ids of the group being resized (1 or more). */
      ids: NodeId[];
      /** Which handle the user grabbed. */
      direction: ResizeDirection;
      /** Bounding rect of the group at gesture start, in document-space. */
      initial_rect: Rect;
      /** Anchor (pointer-down) in document-space. */
      anchor_doc: cmath.Vector2;
      /** Current rect during the gesture, in document-space. */
      current_rect: Rect;
    }
  | {
      kind: "rotate";
      ids: NodeId[];
      corner: RotationCorner;
      /** Subject center in document-space. */
      center_doc: cmath.Vector2;
      /** Angle at gesture start (radians). */
      anchor_angle: number;
      /** Current angle (radians). */
      current_angle: number;
    }
  | {
      kind: "endpoint";
      id: NodeId;
      endpoint: "p1" | "p2";
      /** Current endpoint position in document-space. */
      pos_doc: cmath.Vector2;
    };

export const IDLE: SurfaceGesture = { kind: "idle" };

/**
 * Compute a normalized rectangle from two corner points in document-space.
 * Thin alias over `cmath.rect.fromPoints` for ergonomic two-point use.
 */
export function rectFromPoints(a: cmath.Vector2, b: cmath.Vector2): Rect {
  // Delegated to cmath so normalization rules stay consistent across the repo.
  return cmath.rect.fromPoints([a, b]);
}

/**
 * Apply a resize handle drag to an initial rect and return the new rect.
 *
 * `dx, dy` is the total drag delta in document-space, measured from
 * `anchor_doc` (the pointer-down point) to the current pointer.
 *
 * No constraints: width/height can go negative — host is responsible for
 * normalizing if it cares (most callers clamp to a min-size).
 */
export function applyResize(
  initial: Rect,
  direction: ResizeDirection,
  dx: number,
  dy: number
): Rect {
  let { x, y, width, height } = initial;

  switch (direction) {
    case "n":
      y += dy;
      height -= dy;
      break;
    case "s":
      height += dy;
      break;
    case "e":
      width += dx;
      break;
    case "w":
      x += dx;
      width -= dx;
      break;
    case "ne":
      y += dy;
      height -= dy;
      width += dx;
      break;
    case "nw":
      y += dy;
      height -= dy;
      x += dx;
      width -= dx;
      break;
    case "se":
      width += dx;
      height += dy;
      break;
    case "sw":
      x += dx;
      width -= dx;
      height += dy;
      break;
  }
  return { x, y, width, height };
}
