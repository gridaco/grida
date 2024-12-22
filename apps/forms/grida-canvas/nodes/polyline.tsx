import React from "react";
import type { grida } from "@/grida";
import queryattributes from "./utils/attributes";
import { svg } from "@/grida/svg";

export function SVGPolyLineWidget({
  width: _width,
  height: _height,
  fill,
  stroke,
  strokeWidth,
  strokeCap,
  points,
  style,
  ...props
}: grida.program.document.IComputedNodeReactRenderProps<grida.program.nodes.PolylineNode>) {
  const width = Math.max(_width, 1);
  const height = Math.max(_height, 1);

  const { defs: fillDefs, ref: fillDef } = fill
    ? svg.paint.defs(fill)
    : {
        defs: undefined,
        ref: "none",
      };

  const { defs: strokeDefs, ref: strokeDef } = stroke
    ? svg.paint.defs(stroke)
    : {
        defs: undefined,
        ref: "none",
      };

  return (
    <svg
      {...queryattributes(props)}
      style={{
        ...style,
        overflow: "visible", // shall be visible since the polyline has a stroke width
        // debug
        // border: "1px solid red",
      }}
      width={width}
      height={height}
    >
      {fillDefs && <g dangerouslySetInnerHTML={{ __html: fillDefs }} />}
      {strokeDefs && <g dangerouslySetInnerHTML={{ __html: strokeDefs }} />}
      <polyline
        points={points.map(([x, y]) => `${x},${y}`).join(" ")}
        fill={fillDef}
        stroke={strokeDef}
        strokeWidth={strokeWidth}
        strokeLinecap={strokeCap}
      />
    </svg>
  );
}
