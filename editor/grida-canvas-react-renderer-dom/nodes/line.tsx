import React from "react";
import type grida from "@grida/schema";
import queryattributes from "./utils/attributes";
import { svg } from "@/grida-canvas-utils/svg";
import { css } from "@/grida-canvas-utils/css";

export function SVGLineWidget({
  layout_target_width: width,
  layout_target_height: height,
  stroke,
  stroke_width,
  stroke_cap,
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
      width={css.toDimension(width)}
      height={1}
    >
      {strokeDefs && <g dangerouslySetInnerHTML={{ __html: strokeDefs }} />}
      <line
        x1="0"
        y1="0"
        x2={"100%"}
        y2="0"
        stroke={strokeDef}
        strokeWidth={stroke_width}
        strokeLinecap={stroke_cap}
      />
    </svg>
  );
}
