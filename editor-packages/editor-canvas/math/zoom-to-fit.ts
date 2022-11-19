import type { Box, XY } from "types";

/**
 * this function provides a new offset for the canvas when user executes zoom-to-fit action, which resetting the canvas zoom to 1.
 * the givven factors are.
 * @param viewbound the viewbound of the canvas.
 * @param offset the current offset of the canvas.
 * @param scale the current scale of the canvas.
 * @param newScale the new scale of the canvas. @default 1
 *
 * @returns the new offset of the canvas.
 *
 * @deprecated not tested
 */
export function zoomToFit(
  viewbound: Box,
  offset: XY,
  scale: number,
  newScale: number = 1
): XY {
  const [x, y, w, h] = viewbound;
  const [ox, oy] = offset;
  const newOffset: XY = [
    (x + w / 2) * (1 - newScale / scale) + ox,
    (y + h / 2) * (1 - newScale / scale) + oy,
  ];
  return newOffset;
}
