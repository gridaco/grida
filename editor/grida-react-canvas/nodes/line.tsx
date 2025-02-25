import React from "react";
import type { grida } from "@/grida";
import queryattributes from "./utils/attributes";
import { svg } from "@/grida/svg";

export function SVGLineWidget({
  width,
  height,
  stroke,
  strokeWidth,
  strokeCap,
  style,
  ...props
}: grida.program.document.IComputedNodeReactRenderProps<grida.program.nodes.LineNode>) {
  const style_without_height: React.CSSProperties = {
    ...style,
    height: undefined,
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
      style={style_without_height}
      width={width}
      height={1}
    >
      {strokeDefs && <g dangerouslySetInnerHTML={{ __html: strokeDefs }} />}
      <line
        x1={0}
        y1={0}
        x2={width}
        y2={0}
        stroke={strokeDef}
        strokeWidth={strokeWidth}
        strokeLinecap={strokeCap}
      />
    </svg>
  );
}
