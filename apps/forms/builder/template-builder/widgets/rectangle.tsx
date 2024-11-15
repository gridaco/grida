import { grida } from "@/grida";
import { svg } from "@/grida/svg";
import { useMemo } from "react";

export function RectangleWidget({
  width,
  height,
  fill,
  cornerRadius,
  ...props
}: grida.program.document.IComputedNodeReactRenderProps<grida.program.nodes.RectangleNode>) {
  const isUniformRadius = typeof cornerRadius === "number";

  const { defs, fill: fillDef } = fill
    ? svg.fill.fill_with_defs(fill)
    : {
        defs: undefined,
        fill: undefined,
      };

  return (
    <svg {...props} width={width} height={height}>
      {defs && <g dangerouslySetInnerHTML={{ __html: defs }} />}

      {isUniformRadius ? (
        <rect
          width={width}
          height={height}
          rx={cornerRadius}
          ry={cornerRadius}
          fill={fillDef}
        />
      ) : (
        <path
          d={svg.d.generateRoundedRectPath(width, height, cornerRadius)}
          fill={fillDef}
        />
      )}
    </svg>
  );
}
