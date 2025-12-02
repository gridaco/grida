import grida from "@grida/schema";
import { svg } from "@/grida-canvas-utils/svg";
import { useMemo } from "react";
import queryattributes from "./utils/attributes";
import vn from "@grida/vn";

/**
 * @deprecated - not ready - do not use in production
 * @returns
 */
export function VectorWidget({
  width: _width,
  height: _height,
  fill,
  stroke,
  stroke_width,
  stroke_cap,
  style,
  vectorNetwork,
  fillRule,
  ...props
}: grida.program.document.IComputedNodeReactRenderProps<grida.program.nodes.VectorNode>) {
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

  const d = useMemo(() => vn.toSVGPathData(vectorNetwork), [vectorNetwork]);

  return (
    <svg
      {...queryattributes(props)}
      style={{
        ...style,
        overflow: "visible",
      }}
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
    >
      {fillDefs && <g dangerouslySetInnerHTML={{ __html: fillDefs }} />}
      {strokeDefs && <g dangerouslySetInnerHTML={{ __html: strokeDefs }} />}
      <path
        d={d}
        fill={fillDef}
        fillRule={fillRule}
        stroke={strokeDef}
        strokeWidth={stroke_width}
        strokeLinecap={stroke_cap}
      />
    </svg>
  );
}
