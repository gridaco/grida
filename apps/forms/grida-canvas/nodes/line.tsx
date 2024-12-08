import { grida } from "@/grida";
import React from "react";

export function SVGLineWidget({
  width,
  height,
  stroke,
  style,
  ...props
}: grida.program.document.IComputedNodeReactRenderProps<grida.program.nodes.LineNode>) {
  const style_without_height: React.CSSProperties = {
    ...style,
    height: undefined,
  };

  // TODO: stroke

  return (
    <svg {...props} style={style_without_height} width={width} height={1}>
      {/* {defs && <g dangerouslySetInnerHTML={{ __html: defs }} />} */}
      <line
        x1={0}
        y1={0}
        x2={width}
        y2={0}
        // TODO:
        strokeWidth={1}
        stroke="black"
      />
    </svg>
  );
}
