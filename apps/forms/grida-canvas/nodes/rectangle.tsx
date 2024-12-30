import { grida } from "@/grida";
import { svg } from "@/grida/svg";
import queryattributes from "./utils/attributes";

export function RectangleWidget({
  style,
  width,
  height,
  fill,
  stroke,
  strokeWidth,
  cornerRadius,
  ...props
}: grida.program.document.IComputedNodeReactRenderProps<grida.program.nodes.RectangleNode>) {
  const isUniformRadius = typeof cornerRadius === "number";

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

      {isUniformRadius ? (
        <rect
          width={width}
          height={height}
          rx={cornerRadius}
          ry={cornerRadius}
          fill={fillDef}
          strokeWidth={strokeWidth}
          stroke={strokeDef}
        />
      ) : (
        <path
          d={svg.d.generateRoundedRectPath(width, height, cornerRadius)}
          fill={fillDef}
          strokeWidth={strokeWidth}
          stroke={strokeDef}
        />
      )}
    </svg>
  );
}
