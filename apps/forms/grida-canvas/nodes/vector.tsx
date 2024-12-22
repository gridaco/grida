import { grida } from "@/grida";
import { svg } from "@/grida/svg";
import queryattributes from "./utils/attributes";

/**
 * @deprecated - not ready - do not use in production
 * @returns
 */
export function VectorWidget({
  width,
  height,
  fill,
  style,
  paths,
  vectorNetwork,
  ...props
}: grida.program.document.IComputedNodeReactRenderProps<grida.program.nodes.VectorNode>) {
  const { defs, ref: fillDef } = fill
    ? svg.paint.defs(fill)
    : {
        defs: undefined,
        ref: "none",
      };

  const style_without_size = {
    ...style,
    width: undefined,
    height: undefined,
  };

  // TODO: experimental
  if (vectorNetwork) {
    const d = svg.d.fromVectorNetwork(vectorNetwork);

    console.log("d", d, vectorNetwork);

    return (
      <svg
        {...queryattributes(props)}
        style={{
          ...style,
          overflow: "visible",
        }}
        width={width || 1}
        height={height || 1}
      >
        {defs && <g dangerouslySetInnerHTML={{ __html: defs }} />}
        <path
          d={d}
          fill={fillDef}
          // TODO:
          strokeWidth={1}
          stroke="red"
        />
      </svg>
    );
  }

  const fillpaths = paths.filter((p) => p.fill === "fill");
  const strokepaths = paths.filter((p) => p.fill === "stroke");
  // Combine all paths into a single composite shape
  const fp_combinedPathD = fillpaths.map(({ d }) => d).join(" ");
  const fp_fillrule = fillpaths[0]?.fillRule;

  return (
    <svg
      {...queryattributes(props)}
      style={style_without_size}
      width={width}
      height={height || 1}
    >
      {defs && <g dangerouslySetInnerHTML={{ __html: defs }} />}
      {/* fill paths */}
      {fp_combinedPathD && (
        <path d={fp_combinedPathD} fill={fillDef} fillRule={fp_fillrule} />
      )}

      {/* stroke paths */}
      {strokepaths.map(({ d, fillRule }, i) => (
        <path
          kernelMatrix={i}
          d={d}
          // TODO:
          fill="red"
          fillRule={fillRule}
        />
      ))}
    </svg>
  );
}
