import grida from "@grida/schema";
import { svg } from "@/grida-canvas-utils/svg";
import queryattributes from "./utils/attributes";

export function EllipseWidget({
  // x,
  // y,
  style,
  width,
  height,
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
      width={width}
      height={height}
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
        cx={width / 2}
        cy={height / 2}
        rx={width / 2}
        ry={height / 2}
        fill={fillDef}
        strokeWidth={stroke_width}
        stroke={strokeDef}
      />
    </svg>
  );
}
