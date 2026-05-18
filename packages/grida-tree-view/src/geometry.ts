/**
 * Pure geometry helpers used by consumer hit-testing / drag wiring.
 *
 * These live in the core (not the consumer) because the math is the part
 * that breaks: clamping rules, threshold edges, auto-scroll easing. The
 * consumer's React/DOM glue must be a thin shell that hands raw numbers
 * to these helpers and trusts the result.
 *
 * Every function here is pure: no DOM, no allocations beyond return
 * values, no time-dependent state.
 */

import type { DropPlacement } from "./types";

/**
 * Classify a vertical position within a row into a drop placement.
 *
 * Splits the row into thirds: top → `before`, middle → `into`, bottom →
 * `after`. `into` is only meaningful when the over-row is a container —
 * callers can still pass it through; the drag-handle / constraint stack
 * resolves whether it's legal.
 *
 * Pass `{ into: false }` for a flat / non-container list (e.g. a reorderable
 * tray): the row splits 50/50 into `before` / `after` only, so callers
 * don't hand-roll the binary split.
 *
 * @param dy        pointer Y relative to the row's top edge (0..height)
 * @param h         row height in px
 * @param options   `into:false` → 2-way before/after split (default 3-way)
 */
export function placementFromY(
  dy: number,
  h: number,
  options?: { into?: boolean }
): DropPlacement {
  if (options?.into === false) {
    if (h <= 0) return "before";
    return dy < h / 2 ? "before" : "after";
  }
  if (h <= 0) return "into";
  const third = h / 3;
  if (dy < third) return "before";
  if (dy > h - third) return "after";
  return "into";
}

/**
 * Convert a horizontal cursor position (relative to a row's left edge)
 * into the visible depth the user is targeting. Used to make a drop
 * horizontal-aware: cursor near the left edge → drop at root level,
 * cursor near the row's own indent → drop at the row's depth.
 *
 * Output is clamped to `[0, rowDepth]` — you can't request a sibling
 * deeper than the over-row itself (that would just be "into").
 *
 * @param dx          pointer X relative to the row's left edge
 * @param indentBase  px from the row's left edge to depth-0's tick
 * @param indentStep  px per indent level
 * @param rowDepth    the over-row's own depth (upper bound)
 */
export function desiredDepthFromX(
  dx: number,
  indentBase: number,
  indentStep: number,
  rowDepth: number
): number {
  if (indentStep <= 0) return 0;
  const raw = Math.floor((dx - indentBase) / indentStep);
  if (raw < 0) return 0;
  if (raw > rowDepth) return rowDepth;
  return raw;
}

/**
 * `true` once the pointer has moved far enough from its start point to
 * count as a drag rather than a click. Standard L²-norm threshold.
 */
export function passedDragThreshold(
  startX: number,
  startY: number,
  x: number,
  y: number,
  thresholdPx: number
): boolean {
  const dx = x - startX;
  const dy = y - startY;
  return dx * dx + dy * dy >= thresholdPx * thresholdPx;
}

/**
 * Compute how many pixels a scrollable container should be scrolled this
 * frame so the user can reach off-screen rows while dragging. Returns 0
 * when the pointer is comfortably inside the container; negative to scroll
 * up; positive to scroll down. Linearly interpolated by how deep into the
 * edge zone the pointer is, clamped to `[2, maxSpeed]` magnitude so the
 * slowest scroll is still visible.
 *
 * @param top       container top (client space)
 * @param bottom    container bottom (client space)
 * @param y         pointer y (client space)
 * @param edge      edge zone size in px (default 32)
 * @param maxSpeed  cap on per-frame delta in px (default 16)
 */
export function autoScrollDelta(
  top: number,
  bottom: number,
  y: number,
  edge = 32,
  maxSpeed = 16
): number {
  if (edge <= 0) return 0;
  if (y < top + edge) {
    const t = Math.min(1, (top + edge - y) / edge);
    const v = Math.max(2, t * maxSpeed);
    return -v;
  }
  if (y > bottom - edge) {
    const t = Math.min(1, (y - (bottom - edge)) / edge);
    const v = Math.max(2, t * maxSpeed);
    return v;
  }
  return 0;
}

/**
 * Snap-to-edge fallback for outside-aware hit-testing. When a direct hit
 * fails but the pointer's y is above the first row or below the last,
 * return a synthesized drop on that boundary row. Returns `null` when
 * the pointer is inside the rows' y-range but missed a row (a real gap).
 *
 * @param y           pointer y (client space)
 * @param firstTop    first row's top edge
 * @param lastBottom  last row's bottom edge
 */
export function snapToEdge(
  y: number,
  firstTop: number,
  lastBottom: number
): "before-first" | "after-last" | null {
  if (y < firstTop) return "before-first";
  if (y > lastBottom) return "after-last";
  return null;
}
