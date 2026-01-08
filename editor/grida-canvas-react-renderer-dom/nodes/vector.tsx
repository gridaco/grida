import grida from "@grida/schema";
import { svg } from "@/grida-canvas-utils/svg";
import { useMemo } from "react";
import queryattributes from "./utils/attributes";
import vn from "@grida/vn";
import { css } from "@/grida-canvas-utils/css";

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
  vector_network,
  fill_rule,
  ...props
}: grida.program.document.IComputedNodeReactRenderProps<grida.program.nodes.VectorNode>) {
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

  const d = useMemo(() => vn.toSVGPathData(vector_network), [vector_network]);

  // Calculate bounding box from vector network to use as viewBox
  // This makes it resolution-independent and works with any CSS dimension type
  const viewBox = useMemo(() => {
    const bbox = vn.getBBox(vector_network);
    // Ensure minimum dimensions to avoid division by zero
    const minSize = 1;
    const viewBoxWidth = Math.max(bbox.width, minSize);
    const viewBoxHeight = Math.max(bbox.height, minSize);
    return `${bbox.x} ${bbox.y} ${viewBoxWidth} ${viewBoxHeight}`;
  }, [vector_network]);

  return (
    <svg
      {...queryattributes(props)}
      style={{
        ...style,
        overflow: "visible",
      }}
      width={css.toDimension(_width)}
      height={css.toDimension(_height)}
      viewBox={viewBox}
      preserveAspectRatio="none"
    >
      {fillDefs && <g dangerouslySetInnerHTML={{ __html: fillDefs }} />}
      {strokeDefs && <g dangerouslySetInnerHTML={{ __html: strokeDefs }} />}
      <path
        d={d}
        fill={fillDef}
        fillRule={fill_rule}
        stroke={strokeDef}
        strokeWidth={stroke_width}
        strokeLinecap={stroke_cap}
      />
    </svg>
  );
}
