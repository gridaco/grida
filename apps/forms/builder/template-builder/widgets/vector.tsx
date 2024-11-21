import { grida } from "@/grida";
import { svg } from "@/grida/svg";

/**
 * @deprecated - not ready - do not use in production
 * @returns
 */
export function VectorWidget({
  paths,
  width,
  height,
  fill,
  ...props
}: grida.program.document.IComputedNodeReactRenderProps<grida.program.nodes.VectorNode>) {
  const { defs, fill: fillDef } = fill
    ? svg.fill.fill_with_defs(fill)
    : {
        defs: undefined,
        fill: "none",
      };

  // Combine all paths into a single composite shape
  const combinedPathD = paths.map(({ d }) => d).join(" ");
  const fillrule = paths[0]?.fillRile;

  return (
    <svg {...props} width={width} height={height}>
      {defs && <g dangerouslySetInnerHTML={{ __html: defs }} />}
      <path d={combinedPathD} fill={fillDef} fillRule={fillrule} />
    </svg>
  );
}
