import { grida } from "@/grida";

export function RectangleWidget({
  width,
  height,
  fill,
  cornerRadius,
  ...props
}: grida.program.document.IComputedNodeReactRenderProps<grida.program.nodes.RectangleNode>) {
  const isUniformRadius = typeof cornerRadius === "number";

  return (
    <svg {...props} width={width} height={height}>
      {isUniformRadius ? (
        <rect
          width={width}
          height={height}
          rx={cornerRadius}
          ry={cornerRadius}
          fill={grida.program.css.toRGBAString(fill)}
        />
      ) : (
        <path
          d={grida.program.svg.d.generateRoundedRectPath(
            width,
            height,
            cornerRadius
          )}
          fill={grida.program.css.toRGBAString(fill)}
        />
      )}
    </svg>
  );
}
