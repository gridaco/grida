/**
 * this function calculates the offset of the xy that should be applied to the canvas while transforming.
 *
 * the canvas is transformed with css transform() with scale, translateX, translateY.
 * if the xy is not translated, the canvas will visually scaled from top left.
 * what we want is to make the canvas scale from center (visaully).
 *
 * input:
 * @param zoomDelta: the delta of the zoom
 * @param center: the absolute point where the zoom was initiated. the canvas will transform from this point, keeping this point visually still.
 * @param canvasOffset: the origin of the canvas (the offset) (not scaled)
 *
 * the output is the absolute offset that should be applyied to the canvas to make it trasform with scale and translate from the origin as center.
 */
export function translate_while_keeping_center(
  zoomDelta: number,
  center: [number, number],
  canvasOffset: [number, number]
): [number, number] {
  const [x, y] = center;
  const [ox, oy] = canvasOffset;
  const [cx, cy] = [x - ox, y - oy];
  const [dx, dy] = [cx * zoomDelta, cy * zoomDelta];
  return [ox - dx, oy - dy];
}

/**
 *
 * @param zoomDelta the delta of the zoom
 * @param canvasOffset the origin of the canvas (the offset)
 * @param canvasSize size of the canvas in width and height
 *
 * @returns the final xy position that canvas should be positioned after the scaling.
 */
export function transform_center_by_zoom_delta(
  zoomDelta: number,
  canvasOffset: [number, number],
  canvasSize: [number, number]
): [number, number] {
  const [cx, cy] = canvasOffset;
  const [cw, ch] = canvasSize;
  const dx = cx + (cw / 2) * zoomDelta;
  const dy = cy + (ch / 2) * zoomDelta;
  return [dx, dy];
}

/**
 *
 * @param s scale value
 * @param x current x
 * scale(1) translateX(100)
 * scale(2, 100) // target scale, current x
 * scale(1) translateX(n)
 * n = ?
 *
 * => transform(scale(2), translateX(50))
 */
function preserve_abs_after_scale(s: number, x: number): number {
  // get the n
  const n = x / s;
  return n;
}
