/**
 * edge scrolling
 * scroll (translate) the canvas if the cursor is near the edge (viewbound) with marginal value.
 * get the distance from each edge.
 *
 * for example,
 * - if the cursor is at [19, 19], and the margin is 20, the canvas will be translated to [-1, -1]
 * - if the cursor is at [19, 19], and the margin is 10, the canvas will be translated to [0, 0]
 * - if the cursor is at [0, 0], and the margin is 10, the canvas will be translated to [-10, -10]
 * - if the cursor is at [0, 0], and the margin is 20, the canvas will be translated to [-20, -20]
 * - if the cursor is at [1920, 1080] on a [0, 0, 1920, 1090] viewbound, and the margin is 20, the canvas will be translated to [20, 20]
 * - if the cursor is at [1920, 0] on a [0, 0, 1920, 1090] viewbound, and the margin is 20, the canvas will be translated to [20, -20]
 * - if the cursor is at [1920, 500] on a [0, 0, 1920, 1090] viewbound, and the margin is 20, the canvas will be translated to [20, 0]
 *
 *
 *
 * @param cx x coordinate of the cursor
 * @param cy y coordinate of the cursor
 * @param viewbound the viewbound of the canvas (l x1, t y1, r x2, b y2)
 * @param margin the margin value (default 40px)
 * @param factor the returned value will be multiplied by this factor (default 1/4)
 *
 * @returns [number, number] the translation of the canvas
 */
export function edge_scrolling(
  cx: number,
  cy: number,
  viewbound: [number, number, number, number],
  margin = 40,
  factor = 1 / 4
): [number, number] {
  const [l, t, r, b] = viewbound;
  let [dx, dy] = [0, 0];

  if (cx < l + margin) {
    dx = l - cx + margin;
  } else if (cx > r - margin) {
    dx = r - cx - margin;
  }

  if (cy < t + margin) {
    dy = t - cy + margin;
  } else if (cy > b - margin) {
    dy = b - cy - margin;
  }

  return [dx * factor, dy * factor];
}
