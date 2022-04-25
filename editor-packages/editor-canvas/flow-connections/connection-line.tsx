import React from "react";
import type { XY } from "../types";

export function ConnectionLine({
  a,
  b,
  width = 2,
  color = "blue",
}: { a: XY; b: XY } & {
  width?: number;
  color?: React.CSSProperties["color"];
}) {
  return (
    <svg
      fill="transparent"
      style={{
        position: "absolute",
        pointerEvents: "none",
        transform: `translate(${a[0]}px, ${a[1]}px)`,
        zIndex: 10,
      }}
    >
      <path
        stroke={color}
        strokeWidth={width}
        path={
          "M-7.13146339692298, 189.77152325230148 -2.13146339692298, 194.77152325230148 -7.13146339692298, 199.77152325230148"
        }
      />
    </svg>
  );
}

/**
 *
 * makes the svg path data that connects point a to point b, with extra parameters, curve delta and edge inset
 *
 * e.g. the output of this function is:
 * - `"M 0 0 L 0 0 L 8 0 L 8 0 C 17.1638 0 25.4139 5.5525 28.8641 14.042 L 165.907 351.249 C 169.358 359.739 177.608 365.291 186.772 365.291 L 186.772 365.291 L 194.772 365.291"`
 *
 * @param a the starting point a
 * @param b the ending point b
 * @param curve the curve delta
 * @param edge the edge (margin) value
 */
function make_svg_path_data(a, b, curve, edge) {}
