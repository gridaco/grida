import React from "react";
import type { grida } from "@/grida";
import queryattributes from "./utils/attributes";

export function SVGPolyLineWidget({
  width,
  height,
  points,
  style,
  ...props
}: grida.program.document.IComputedNodeReactRenderProps<grida.program.nodes.PolylineNode>) {
  return (
    <svg
      {...queryattributes(props)}
      style={{
        ...style,
        overflow: "visible", // shall be visible since the polyline has a stroke width
        // debug
        // border: "1px solid red"
      }}
      width={width}
      height={height}
    >
      {/* {defs && <g dangerouslySetInnerHTML={{ __html: defs }} />} */}
      <polyline
        strokeWidth={3}
        points={points.map(([x, y]) => `${x},${y}`).join(" ")}
        stroke="black"
        fill="none"
      />
    </svg>
  );
}
