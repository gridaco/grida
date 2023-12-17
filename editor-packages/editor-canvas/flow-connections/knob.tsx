import {
  color_connection_knob_fill,
  color_connection_knob_stroke,
} from "../theme";
import type { XY } from "../types";

export function Knob({ point, size = 6 }: { point: XY; size: number }) {
  return (
    <svg
      fill="transparent"
      style={{
        overflow: "visible",
        position: "absolute",
        pointerEvents: "none",
        transform: `translate(${point[0]}px, ${point[1]}px)`,
        zIndex: 10,
      }}
    >
      <circle
        r={size}
        stroke={color_connection_knob_stroke}
        fill={color_connection_knob_fill}
        strokeWidth={2}
      />
    </svg>
  );
}
