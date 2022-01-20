/**
 * this function calculates the transform of the canvas.
 * while scaling (zooming) the canvas, the transform should be made according to scale origin point.
 *
 * the canvas is in 0, 0 as in xy.
 * the input is
 * 1. scale origin as xy point
 * 2. scale delta as number
 *
 * the output is the xy delta.
 */
export function transform_by_zoom_delta(
  zoomDelta: number,
  zoomOrigin: [number, number]
): [number, number] {
  //TODO: this is incorrect.
  const [x, y] = zoomOrigin;
  const dX = -(x * zoomDelta);
  const dY = -(y * zoomDelta);
  return [dX, dY];
}
