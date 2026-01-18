import React from "react";
import queryattributes from "./utils/attributes";
import grida from "@grida/schema";
import { svg } from "@/grida-canvas-utils/svg";
import type cg from "@grida/cg";

/**
 * @deprecated - not ready - do not use in production
 */
interface PolylineNode
  extends grida.program.nodes.i.IBaseNode,
    grida.program.nodes.i.ISceneNode,
    grida.program.nodes.i.IHrefable,
    grida.program.nodes.i.IPositioning,
    grida.program.nodes.i.IBlend,
    grida.program.nodes.i.IFill<cg.Paint>,
    grida.program.nodes.i.IStroke {
  type: "polyline";
  points: cg.Vector2[];
  width: number;
  height: number;
  rotation: number;
  z_index: number;
}

/**
 * @deprecated
 *
 * only for archive purposes
 */
export function SVGPolyLineWidget({
  width: _width,
  height: _height,
  fill,
  stroke,
  stroke_width,
  stroke_cap,
  style,
  points,
  ...props
}: // @ts-expect-error - PolylineNode props type mismatch
grida.program.document.IComputedNodeReactRenderProps<PolylineNode>) {
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
        strokeWidth={stroke_width}
        strokeLinecap={stroke_cap}
      />
    </svg>
  );
}
