import grida from "@grida/schema";
import { svg } from "@/grida-canvas-utils/svg";
import queryattributes from "./utils/attributes";

/**
 * @deprecated - not ready - do not use in production
 * @returns
 */
export function SVGPathWidget({
  width,
  height,
  fill,
  style,
  paths,
  ...props
}: grida.program.document.IComputedNodeReactRenderProps<grida.program.nodes.SVGPathNode>) {
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

  const fillpaths = paths.filter((p) => p.fill === "fill");
  const strokepaths = paths.filter((p) => p.fill === "stroke");
  // Combine all paths into a single composite shape
  const fp_combinedPathD = fillpaths.map(({ d }) => d).join(" ");
  const fp_fillrule = fillpaths[0]?.fill_rule;

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
      {strokepaths.map(({ d, fill_rule }, i) => (
        <path
          key={i}
          kernelMatrix={i}
          d={d}
          // TODO:
          fill="red"
          fillRule={fill_rule}
        />
      ))}
    </svg>
  );
}
