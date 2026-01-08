import grida from "@grida/schema";
import { svg } from "@/grida-canvas-utils/svg";
import queryattributes from "./utils/attributes";
import React, { useMemo } from "react";
import vn from "@grida/vn";
import { css } from "@/grida-canvas-utils/css";

export function RegularPolygonWidget({
  layout_target_width: width,
  layout_target_height: height,
  point_count,
  fill,
  stroke,
  stroke_width,
  style,
  ...props
}: grida.program.document.IComputedNodeReactRenderProps<grida.program.nodes.RegularPolygonNode>) {
  const { defs: fillDefs, ref: fillDef } = fill
    ? svg.paint.defs(fill)
    : { defs: undefined, ref: "none" };

  const { defs: strokeDefs, ref: strokeDef } = stroke
    ? svg.paint.defs(stroke)
    : { defs: undefined, ref: "none" };

  // Generate polygon in normalized coordinate system (0-100)
  // This makes it resolution-independent and works with any CSS dimension type
  const points = useMemo(() => {
    const v = vn.fromRegularPolygon({
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      points: point_count,
    });

    return v.vertices.map((v) => `${v[0]},${v[1]}`).join(" ");
  }, [point_count]);

  return (
    <svg
      {...queryattributes(props)}
      style={{ ...style, overflow: "visible" }}
      width={css.toDimension(width)}
      height={css.toDimension(height)}
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
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
