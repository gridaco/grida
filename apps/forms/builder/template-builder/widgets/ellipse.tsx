import { grida } from "@/grida";
import { svg } from "@/grida/svg";

export function EllipseWidget({
  // x,
  // y,
  width,
  height,
  fill,
  ...props
}: grida.program.document.IComputedNodeReactRenderProps<grida.program.nodes.EllipseNode>) {
  const { defs, fill: fillDef } = fill
    ? svg.fill.fill_with_defs(fill)
    : {
        defs: undefined,
        fill: undefined,
      };

  return (
    <svg {...props} width={width} height={height}>
      {defs && <g dangerouslySetInnerHTML={{ __html: defs }} />}
      <ellipse
        cx={width / 2}
        cy={height / 2}
        rx={width / 2}
        ry={height / 2}
        fill={fillDef}
      />
    </svg>
  );
}
