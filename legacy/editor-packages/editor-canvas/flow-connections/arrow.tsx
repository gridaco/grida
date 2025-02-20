import React from "react";
import type { XY } from "../types";

export function Arrow({
  b,
  color,
  size,
  width,
  direction,
}: {
  b: XY;
  color: React.CSSProperties["color"];
  size: number;
  width: number;
  direction: "n" | "s" | "e" | "w";
}) {
  return (
    <path
      stroke={color}
      strokeWidth={width}
      d={make_arrow_svg_path_data(b, direction, {
        width: size,
        height: size / 2,
      })}
    />
  );
}

/**
 *
 * the result will have 3 modifiers,
 * if the arrow is facing right, the modifiers will be:
 * - M - starting point [edge_x - height, edge_y + width / 2]
 * - L - edge           [edge_x, edge_y]
 * - L - ending point   [edge_x - height, edge_y - width / 2]
 *
 * @param edge the edge of a arrow (triangle)
 * @param width
 */
function make_arrow_svg_path_data(
  edge: XY,
  direction: "n" | "s" | "e" | "w",
  { width, height }: { width: number; height: number }
) {
  const [x, y] = edge;
  const w = width / 2;
  switch (direction) {
    case "e": {
      return `M${x - height},${y + w} L${x},${y} L${x - height},${y - w}`;
    }
    case "w": {
      return `M${x + height},${y + w} L${x},${y} L${x + height},${y - w}`;
    }
    case "n": {
      return `M${x - w},${y + height} L${x},${y} L${x + w},${y + height}`;
    }
    case "s": {
      return `M${x - w},${y - height} L${x},${y} L${x + w},${y - height}`;
    }
    default: {
      throw new Error(`invalid direction: ${direction}`);
    }
  }
}
