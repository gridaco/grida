import { grida } from "@/grida";

export function EllipseWidget({
  // x,
  // y,
  width,
  height,
  fill,
  ...props
}: grida.program.document.IComputedNodeReactRenderProps<grida.program.nodes.EllipseNode>) {
  return (
    <svg {...props} width={width} height={height}>
      <ellipse
        cx={width / 2}
        cy={height / 2}
        rx={width / 2}
        ry={height / 2}
        // TODO:
        // fill={grida.program.css.toRGBAString(fill)}
      />
    </svg>
  );
}
