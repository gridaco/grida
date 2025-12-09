import grida from "@grida/schema";
import { svg } from "@/grida-canvas-utils/svg";
import queryattributes from "./utils/attributes";

export function RectangleWidget({
  style,
  width,
  height,
  fill,
  stroke,
  stroke_width,
  rectangular_corner_radius_top_left,
  rectangular_corner_radius_top_right,
  rectangular_corner_radius_bottom_left,
  rectangular_corner_radius_bottom_right,
  ...props
}: grida.program.document.IComputedNodeReactRenderProps<grida.program.nodes.RectangleNode>) {
  const isZero =
    rectangular_corner_radius_top_left === 0 &&
    rectangular_corner_radius_top_right === 0 &&
    rectangular_corner_radius_bottom_left === 0 &&
    rectangular_corner_radius_bottom_right === 0;

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

      {isZero ? (
        <rect
          width={width}
          height={height}
          fill={fillDef}
          strokeWidth={stroke_width}
          stroke={strokeDef}
        />
      ) : (
        <path
          d={svg.d.generateRoundedRectPath(width, height, [
            rectangular_corner_radius_top_left ?? 0,
            rectangular_corner_radius_top_right ?? 0,
            rectangular_corner_radius_bottom_right ?? 0,
            rectangular_corner_radius_bottom_left ?? 0,
          ])}
          fill={fillDef}
          strokeWidth={stroke_width}
          stroke={strokeDef}
        />
      )}
    </svg>
  );
}
