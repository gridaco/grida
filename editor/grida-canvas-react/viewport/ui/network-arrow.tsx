import { cn } from "@/components/lib/utils";
import cmath from "@grida/cmath";
import React, { useMemo } from "react";

export function NetworkArrow({
  b,
  size,
  width,
  direction,
  className,
}: {
  b: cmath.Vector2;
  className?: string;
  size: number;
  width: number;
  direction: "n" | "s" | "e" | "w";
}) {
  const d = useMemo(
    () =>
      make_arrow_svg_path_data(b, direction, {
        width: size,
        height: size / 2,
      }),
    [b, size, direction]
  );

  return (
    <path
      strokeWidth={width}
      d={d}
      className={cn("stroke-current", className)}
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
  edge: cmath.Vector2,
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
