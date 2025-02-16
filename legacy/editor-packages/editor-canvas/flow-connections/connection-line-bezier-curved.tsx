import { color_connection_line } from "../theme";
import type { XY } from "../types";
import { Arrow } from "./arrow";
import { get_direction } from "./math";
import type { ConnectionLineStyleProps } from "./props";

export function BezierCurvedLine({
  a,
  b,
  width = 2,
  color = color_connection_line,
}: { a: XY; b: XY } & ConnectionLineStyleProps) {
  const direction = get_direction(a, b);

  return (
    <svg
      fill="transparent"
      style={{
        overflow: "visible",
        position: "absolute",
        pointerEvents: "none",
        // transform: `translate(${a[0]}px, ${a[1]}px)`,
        zIndex: 10,
      }}
    >
      <path
        stroke={color}
        strokeWidth={width}
        d={make_bazier_curved_svg_path_data(
          a,
          b,
          direction_to_axis_map[direction]
        )}
      />
      <Arrow
        color={color}
        size={12}
        b={b}
        width={width}
        direction={direction}
      />
    </svg>
  );
}

const direction_to_axis_map = {
  n: "v",
  s: "v",
  e: "h",
  w: "h",
} as const;

/**
 * make a svg path data to connect point a to point b
 *
 * the output will contain 2 commands
 * - M - starting point
 * - C - curve
 *
 * e.g. for a a[0, 0], b[1000, 500], (1000x500 box)
 * - `"M 0 0 C 500 0 500 500 1000 500"`
 *    - M a[0], a[1]            (start point)
 *    - C0 a[0] + w / 2, a[1]
 *    - C1 a[0] + w / 2, b[1]
 *    - C2 b[0], b[1]           (end point)
 *
 * @param a - starting point
 * @param b - ending point
 */
function make_bazier_curved_svg_path_data(a: XY, b: XY, axis: "h" | "v" = "h") {
  const [x0, y0] = a;
  const [x1, y1] = b;
  const w = axis === "h" ? x1 - x0 : y1 - y0;

  if (axis === "h") {
    return `M ${x0},${y0} C ${x0 + w / 2},${y0} ${
      x0 + w / 2
    },${y1} ${x1},${y1}`;
  } else if (axis === "v") {
    return `M ${x0},${y0} C ${x0},${y0 + w / 2} ${x1},${
      y0 + w / 2
    } ${x1},${y1}`;
  }
}
