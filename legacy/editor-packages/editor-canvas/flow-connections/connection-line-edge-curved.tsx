import React from "react";
import type { XY } from "../types";
import { Arrow } from "./arrow";
import { get_direction } from "./math";

/**
 * @deprecated - not implemented
 * @param param0
 * @returns
 */
export function EdgeCurvedConnectionLine({
  a,
  b,
  width = 2,
  color = "blue",
}: { a: XY; b: XY } & {
  width?: number;
  color?: React.CSSProperties["color"];
}) {
  const direction = get_direction(a, b);
  return (
    <svg
      fill="transparent"
      height={Math.abs(b[1] - a[1])}
      width={Math.abs(b[0] - a[0])}
      style={{
        overflow: "visible",
        position: "absolute",
        pointerEvents: "none",
        transform: `translate(${a[0]}px, ${a[1]}px)`,
        zIndex: 10,
      }}
    >
      <Line a={a} b={b} />
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

function Line({ a, b }: { a: XY; b: XY }) {
  return <path d="" />;
}

/**
 *
 * makes the svg path data that connects point a to point b, with extra parameters, curve delta and edge inset
 *
 * the shape looks line
 * ```
 * (a) ---
 *        |
 *        |
 *        |
 *        |
 *        |
 *         --- (b)
 * ```
 *
 * the line components are..
 * 0. M   | starting point
 * 1. L L | the line from `a - edge` to `a` - [a - edge, a]
 * 2. C   | the curve to before 3
 * 3. L   | the line from `a` to `b` - [a, b]
 * 4. C   | the curve to after 3
 * 5. L L | the line from `b` to `b + edge` - [b, b + edge]
 *
 * the output command is:
 * - M - the start point (a)
 * - L - line start
 * - L - draw line to the curving point
 * - C - curve
 * - L - line between two curves
 * - C - curve
 * - L - line start
 * - L - line end point
 *
 * e.g. the output of this function is:
 * - `"M 0 0 L 0 0 L 8 0 L 8 0 C 17.1638 0 25.4139 5.5525 28.8641 14.042 L 165.907 351.249 C 169.358 359.739 177.608 365.291 186.772 365.291 L 186.772 365.291 L 194.772 365.291"`
 *
 * @param a the starting point a
 * @param b the ending point b
 * @param curve the curve delta
 * @param edge the edge (margin) value
 */
function make_svg_path_data(a: XY, b: XY, edge) {}
