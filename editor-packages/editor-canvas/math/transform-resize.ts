import type { ResizeHandleOrigin } from "../overlay/types";
import { XYWH } from "../types";

type TransformOrigin = [number, number];
type Delta = [number, number];

/**
 * this is used for calculating the new node xywh after resizing with delta and origin
 *
 * @param delta the delta is the calculated movement of the mouse inside a canvas space
 * (you might want to reverse it for top, left facing movement)
 *
 * Example:
 * - `[0, 0, 100, 100]` box, [0.5, 0.5] origin, [10, 10] delta => `[-5, -5, 110, 110]` (center origin)
 * - `[0, 0, 100, 100]` box, [0.5, 0.5] origin, [-10, -10] delta => `[5, 5, 90, 90]` (center origin)
 * - `[0, 0, 100, 100]` box, [0, 0] origin, [10, 10] delta => `[0, 0, 110, 110]` (top left origin)
 * - `[0, 0, 100, 100]` box, [1, 1] origin, [10, 10] delta => `[0, 0, 110, 110]` (bottom right origin)
 * - `[0, 0, 100, 100]` box, [0, 1] origin, [10, 10] delta => `[0, 0, 110, 110]` (bottom left origin)
 *
 *
 * @param box The current box dimensions as [x, y, width, height].
 * @param delta The change in size as [deltaX, deltaY].
 * @param origin The point of origin for the resize as a normalized [0, 1] value where [0, 0] is top-left and [1, 1] is bottom-right.
 * @returns An object containing:
 *  - diff: The difference in position and size as [deltaX, deltaY, deltaWidth, deltaHeight].
 *  - value: The new box dimensions as [newX, newY, newWidth, newHeight].
 */
export function resize(
  box: XYWH,
  delta: Delta,
  origin: TransformOrigin = [0, 0]
): { diff: XYWH; value: XYWH } {
  const [x, y, width, height] = box;
  const [deltaX, deltaY] = delta;
  const [originX, originY] = origin;

  // Calculate new width and height
  const newWidth = width + deltaX;
  const newHeight = height + deltaY;

  // Calculate the change in position
  const newX = x - deltaX * originX;
  const newY = y - deltaY * originY;

  // Calculate the difference
  const diffX = newX - x;
  const diffY = newY - y;
  const diffWidth = newWidth - width;
  const diffHeight = newHeight - height;

  return {
    diff: [diffX, diffY, diffWidth, diffHeight],
    value: [newX, newY, newWidth, newHeight],
  };
}

/**
 * Converts the delta (change in position) based on the resize handle origin
 * and optionally applies transformations based on meta key states (e.g., shift or alt keys).
 * This function is designed to adjust the resizing behavior to be more intuitive for users,
 * depending on which part of an element they are interacting with (e.g., corners, edges).
 *
 * @param {ResizeHandleOrigin} origin - Specifies the origin handle used for resizing.
 *        This could be one of "nw", "ne", "sw", "se" for corners, "n", "s", "w", "e" for edges,
 *        indicating the direction from which the resize action is initiated.
 * @param {Delta} delta - The initial x and y delta values indicating the direction and magnitude
 *        of the resize action, typically based on mouse movement.
 * @param {Object} meta - Optional parameter that can contain states of meta keys like shiftKey
 *        and altKey which may modify the behavior of the resize action. For example, holding
 *        the shift key might enforce uniform scaling.
 *        - shiftKey: Indicates if the shift key was pressed during the resize action.
 *        - altKey: Indicates if the alt key was pressed during the resize action.
 *
 * @returns {Object} An object containing the adjusted delta and the normalized origin.
 *         - delta: The adjusted [dx, dy] values after considering the resize handle origin
 *           and any active meta keys. This adjustment can invert delta values to make the resize
 *           action feel more intuitive based on the handle being used.
 *         - origin: A [x, y] pair in a normalized [0, 1] range indicating the transform origin
 *           relative to the element's bounding box. This is calculated based on the resize handle
 *           origin and is used to apply the resizing transformation correctly.
 */
export function cvt_delta_by_resize_handle_origin(
  origin: ResizeHandleOrigin,
  delta: Delta,
  meta?: {
    shiftKey?: boolean;
    altKey?: boolean;
  }
): {
  delta: Delta;
  origin: TransformOrigin;
} {
  let [dx, dy] = delta;

  const handleEffects = {
    nw: () => ({
      dx: -dx,
      dy: -dy,
      origin: meta?.altKey ? [0.5, 0.5] : [1, 1],
    }),
    ne: () => ({ dx: dx, dy: -dy, origin: meta?.altKey ? [0.5, 0.5] : [0, 1] }),
    sw: () => ({ dx: -dx, dy: dy, origin: meta?.altKey ? [0.5, 0.5] : [1, 0] }),
    se: () => ({ dx: dx, dy: dy, origin: meta?.altKey ? [0.5, 0.5] : [0, 0] }),
    n: () => ({
      dx: meta?.altKey ? dx * 2 : 0,
      dy: -dy,
      origin: meta?.altKey ? [0.5, 0.5] : [0.5, 1],
    }),
    s: () => ({
      dx: meta?.altKey ? dx * 2 : 0,
      dy: dy,
      origin: meta?.altKey ? [0.5, 0.5] : [0.5, 0],
    }),
    e: () => ({
      dx: dx,
      dy: meta?.altKey ? dy * 2 : 0,
      origin: meta?.altKey ? [0.5, 0.5] : [0, 0.5],
    }),
    w: () => ({
      dx: -dx,
      dy: meta?.altKey ? dy * 2 : 0,
      origin: meta?.altKey ? [0.5, 0.5] : [1, 0.5],
    }),
  };

  const effect = handleEffects[origin]();
  dx = effect.dx;
  dy = effect.dy;
  const originMapping = effect.origin;

  // Uniform scaling logic, if needed
  if (meta?.shiftKey) {
    const uniformDelta = Math.max(Math.abs(dx), Math.abs(dy));
    dx = dx < 0 ? -uniformDelta : uniformDelta;
    dy = dy < 0 ? -uniformDelta : uniformDelta;
  }

  // Adjust deltas for altKey (resize from center)
  if (meta?.altKey) {
    // For non-corner handles, we need to adjust delta to effectively double the impact
    // since the resize will occur symmetrically from the center.
    if (!["nw", "ne", "sw", "se"].includes(origin)) {
      dx *= 2;
      dy *= 2;
    }
  }

  return {
    delta: [dx, dy],
    origin: originMapping as TransformOrigin,
  };
}
