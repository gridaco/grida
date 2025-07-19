import grida from "@grida/schema";
import { svg } from "@/grida-canvas-utils/svg";
import queryattributes from "./utils/attributes";
import React, { useMemo } from "react";

export function RegularStarPolygonWidget({
  width,
  height,
  pointCount,
  innerRadius,
  fill,
  stroke,
  strokeWidth,
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
    const cx = width / 2;
    const cy = height / 2;
    const outerRx = (width / 2) * 0.9;
    const outerRy = (height / 2) * 0.9;
    const innerRx = outerRx * innerRadius;
    const innerRy = outerRy * innerRadius;
    const step = Math.PI / pointCount;
    const pts: string[] = [];
    for (let i = 0; i < pointCount * 2; i++) {
      const angle = i * step - Math.PI / 2;
      const rx = i % 2 === 0 ? outerRx : innerRx;
      const ry = i % 2 === 0 ? outerRy : innerRy;
      const x = cx + rx * Math.cos(angle);
      const y = cy + ry * Math.sin(angle);
      pts.push(`${x},${y}`);
    }
    return pts.join(" ");
  }, [width, height, pointCount, innerRadius]);

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
