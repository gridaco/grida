import type cmath from "@grida/cmath";
import type { ResizeDirection, RotationCorner } from "./cursor";
import type { Rect } from "./gesture";

import {
  MIN_CHROME_VISIBLE_SIZE as _MIN_VIS,
  ROTATION_OFFSET as _ROT,
} from "./overlay";

/**
 * Visibility threshold: below this selection size (in screen px), handles
 * are hidden — the selection is too small to interact with them.
 *
 * Re-exported from `overlay.ts` (canonical home for shared constants).
 */
export const MIN_HANDLES_VISIBLE_SIZE = _MIN_VIS;

/** Rotation handles sit this many screen-px outside the selection corners. */
export const ROTATION_OFFSET = _ROT;

export interface HandleLayoutOptions {
  /** Screen-space handle hit size (slightly larger than visual size). */
  hitSize?: number;
  /** Rotation handle hit radius in screen-px. */
  rotateHitRadius?: number;
}

const DEFAULT_HIT_SIZE = 12;
const DEFAULT_ROTATE_HIT_RADIUS = 12;

/** A computed handle position in **screen-space**. */
export interface HandleScreenPos {
  /** Center of the handle, in screen-space CSS px. */
  x: number;
  y: number;
}

/** Layout of the 8 resize handles for a selection rect (screen-space). */
export interface ResizeHandleLayout {
  n: HandleScreenPos;
  ne: HandleScreenPos;
  e: HandleScreenPos;
  se: HandleScreenPos;
  s: HandleScreenPos;
  sw: HandleScreenPos;
  w: HandleScreenPos;
  nw: HandleScreenPos;
}

/** Layout of the 4 rotation handles for a selection rect (screen-space). */
export interface RotationHandleLayout {
  nw: HandleScreenPos;
  ne: HandleScreenPos;
  se: HandleScreenPos;
  sw: HandleScreenPos;
}

/**
 * Compute the screen-space positions of the 8 resize handles given the
 * selection bounding rect *projected to screen-space*.
 */
export function resizeHandlesAt(rectScreen: Rect): ResizeHandleLayout {
  const { x, y, width, height } = rectScreen;
  const cx = x + width / 2;
  const cy = y + height / 2;
  const right = x + width;
  const bottom = y + height;
  return {
    nw: { x, y },
    n: { x: cx, y },
    ne: { x: right, y },
    e: { x: right, y: cy },
    se: { x: right, y: bottom },
    s: { x: cx, y: bottom },
    sw: { x, y: bottom },
    w: { x, y: cy },
  };
}

/**
 * Compute the screen-space positions of the 4 rotation handles, offset
 * outward from the corners of the selection rect.
 */
export function rotationHandlesAt(
  rectScreen: Rect,
  offset: number = ROTATION_OFFSET
): RotationHandleLayout {
  const { x, y, width, height } = rectScreen;
  return {
    nw: { x: x - offset, y: y - offset },
    ne: { x: x + width + offset, y: y - offset },
    se: { x: x + width + offset, y: y + height + offset },
    sw: { x: x - offset, y: y + height + offset },
  };
}

/** Whether handles should be drawn for a selection at this screen size. */
export function handlesVisible(rectScreen: Rect): boolean {
  return (
    rectScreen.width >= MIN_HANDLES_VISIBLE_SIZE ||
    rectScreen.height >= MIN_HANDLES_VISIBLE_SIZE
  );
}

/**
 * Hit-test a screen-space point against the 8 resize handles.
 *
 * Returns the matching `ResizeDirection`, or `null` if the point isn't on
 * any handle.
 */
export function hitResizeHandle(
  rectScreen: Rect,
  point: cmath.Vector2,
  options: HandleLayoutOptions = {}
): ResizeDirection | null {
  const hit = options.hitSize ?? DEFAULT_HIT_SIZE;
  const half = hit / 2;
  const layout = resizeHandlesAt(rectScreen);
  const order: ResizeDirection[] = ["nw", "ne", "se", "sw", "n", "e", "s", "w"];
  for (const dir of order) {
    const h = layout[dir];
    if (
      point[0] >= h.x - half &&
      point[0] <= h.x + half &&
      point[1] >= h.y - half &&
      point[1] <= h.y + half
    ) {
      return dir;
    }
  }
  return null;
}

/**
 * Hit-test a screen-space point against the 4 rotation handles (outside the
 * corners). Returns the matching corner or `null`.
 */
export function hitRotationHandle(
  rectScreen: Rect,
  point: cmath.Vector2,
  options: HandleLayoutOptions = {}
): RotationCorner | null {
  const radius = options.rotateHitRadius ?? DEFAULT_ROTATE_HIT_RADIUS;
  const r2 = radius * radius;
  const layout = rotationHandlesAt(rectScreen);
  const corners: RotationCorner[] = ["nw", "ne", "se", "sw"];
  for (const c of corners) {
    const h = layout[c];
    const dx = point[0] - h.x;
    const dy = point[1] - h.y;
    if (dx * dx + dy * dy <= r2) {
      return c;
    }
  }
  return null;
}
