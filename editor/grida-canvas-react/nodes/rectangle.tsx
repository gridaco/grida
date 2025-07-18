import grida from "@grida/schema";
import { svg } from "@/grida-canvas-utils/svg";
import queryattributes from "./utils/attributes";

export function RectangleWidget({
  style,
  width,
  height,
  fill,
  stroke,
  strokeWidth,
  cornerRadiusTopLeft,
  cornerRadiusTopRight,
  cornerRadiusBottomLeft,
  cornerRadiusBottomRight,
  ...props
}: grida.program.document.IComputedNodeReactRenderProps<grida.program.nodes.RectangleNode>) {
  const isZero =
    cornerRadiusTopLeft === 0 &&
    cornerRadiusTopRight === 0 &&
    cornerRadiusBottomLeft === 0 &&
    cornerRadiusBottomRight === 0;

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
          strokeWidth={strokeWidth}
          stroke={strokeDef}
        />
      ) : (
        <path
          d={svg.d.generateRoundedRectPath(width, height, [
            cornerRadiusTopLeft ?? 0,
            cornerRadiusTopRight ?? 0,
            cornerRadiusBottomRight ?? 0,
            cornerRadiusBottomLeft ?? 0,
          ])}
          fill={fillDef}
          strokeWidth={strokeWidth}
          stroke={strokeDef}
        />
      )}
    </svg>
  );
}
