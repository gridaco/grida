import grida from "@grida/schema";
import { svg } from "@/grida-canvas-utils/svg";
import queryattributes from "./utils/attributes";
import React, { useMemo } from "react";

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
    const cx = width / 2;
    const cy = height / 2;
    const rx = (width / 2) * 0.9;
    const ry = (height / 2) * 0.9;
    const step = (Math.PI * 2) / pointCount;
    return Array.from({ length: pointCount }, (_, i) => {
      const angle = i * step - Math.PI / 2;
      const x = cx + rx * Math.cos(angle);
      const y = cy + ry * Math.sin(angle);
      return `${x},${y}`;
    }).join(" ");
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
      <polygon points={points} fill={fillDef} stroke={strokeDef} strokeWidth={strokeWidth} />
    </svg>
  );
}
