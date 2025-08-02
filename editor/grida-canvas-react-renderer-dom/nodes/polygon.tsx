import grida from "@grida/schema";
import { svg } from "@/grida-canvas-utils/svg";
import queryattributes from "./utils/attributes";
import React, { useMemo } from "react";
import vn from "@grida/vn";

export function RegularPolygonWidget({
  width,
  height,
  pointCount,
  fill,
  stroke,
  strokeWidth,
  style,
  ...props
}: grida.program.document.IComputedNodeReactRenderProps<grida.program.nodes.RegularPolygonNode>) {
  const { defs: fillDefs, ref: fillDef } = fill
    ? svg.paint.defs(fill)
    : { defs: undefined, ref: "none" };

  const { defs: strokeDefs, ref: strokeDef } = stroke
    ? svg.paint.defs(stroke)
    : { defs: undefined, ref: "none" };

  const points = useMemo(() => {
    const v = vn.fromRegularPolygon({
      x: 0,
      y: 0,
      width,
      height,
      points: pointCount,
    });

    return v.vertices.map((v) => `${v.p[0]},${v.p[1]}`).join(" ");
  }, [width, height, pointCount]);

  return (
    <svg
      {...queryattributes(props)}
      style={{ ...style, overflow: "visible" }}
      width={width}
      height={height}
    >
      {fillDefs && <g dangerouslySetInnerHTML={{ __html: fillDefs }} />}
      {strokeDefs && <g dangerouslySetInnerHTML={{ __html: strokeDefs }} />}
      <polygon
        points={points}
        fill={fillDef}
        stroke={strokeDef}
        strokeWidth={strokeWidth}
      />
    </svg>
  );
}
