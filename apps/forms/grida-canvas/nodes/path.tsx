import { grida } from "@/grida";
import { svg } from "@/grida/svg";
import queryattributes from "./utils/attributes";

/**
 * @deprecated - not ready - do not use in production
 * @returns
 */
export function PathWidget({
  width,
  height,
  fill,
  style,
  vectorNetwork,
  ...props
}: grida.program.document.IComputedNodeReactRenderProps<grida.program.nodes.PathNode>) {
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

  const d = svg.d.fromVectorNetwork(vectorNetwork);

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
