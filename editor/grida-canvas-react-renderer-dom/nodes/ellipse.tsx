import grida from "@grida/schema";
import { svg } from "@/grida-canvas-utils/svg";
import { css } from "@/grida-canvas-utils/css";
import queryattributes from "./utils/attributes";

export function EllipseWidget({
  // x,
  // y,
  style,
  layout_target_width: width,
  layout_target_height: height,
  fill,
  stroke,
  stroke_width,
  ...props
}: grida.program.document.IComputedNodeReactRenderProps<grida.program.nodes.EllipseNode>) {
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
      width={css.toDimension(width)}
      height={css.toDimension(height)}
      style={{
        ...style,
        overflow: "visible", // shall be visible since the polyline has a stroke width
        // debug
        // border: "1px solid red",
      }}
    >
      {fillDefs && <g dangerouslySetInnerHTML={{ __html: fillDefs }} />}
      {strokeDefs && <g dangerouslySetInnerHTML={{ __html: strokeDefs }} />}
      <ellipse
        cx="50%"
        cy="50%"
        rx="50%"
        ry="50%"
        fill={fillDef}
        strokeWidth={stroke_width}
        stroke={strokeDef}
      />
    </svg>
  );
}
