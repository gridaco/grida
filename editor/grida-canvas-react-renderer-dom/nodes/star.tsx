import grida from "@grida/schema";
import { svg } from "@/grida-canvas-utils/svg";
import queryattributes from "./utils/attributes";
import React, { useMemo } from "react";
import vn from "@grida/vn";

export function RegularStarPolygonWidget({
  width,
  height,
  point_count,
  inner_radius,
  fill,
  stroke,
  stroke_width,
  style,
  ...props
}: grida.program.document.IComputedNodeReactRenderProps<grida.program.nodes.RegularStarPolygonNode>) {
  const { defs: fillDefs, ref: fillDef } = fill
    ? svg.paint.defs(fill)
    : { defs: undefined, ref: "none" };

  const { defs: strokeDefs, ref: strokeDef } = stroke
    ? svg.paint.defs(stroke)
    : { defs: undefined, ref: "none" };

  const points = useMemo(() => {
    const v = vn.fromRegularStarPolygon({
      x: 0,
      y: 0,
      width,
      height,
      points: point_count,
      innerRadius: inner_radius,
    });

    return v.vertices.map((v) => `${v[0]},${v[1]}`).join(" ");
  }, [width, height, point_count, inner_radius]);

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
        strokeWidth={stroke_width}
      />
    </svg>
  );
}
