import { grida } from "@/grida";
import { svg } from "@/grida/svg";
import queryattributes from "./utils/attributes";

/**
 * @deprecated - not ready - do not use in production
 * @returns
 */
export function PathWidget({
  width: _width,
  height: _height,
  fill,
  stroke,
  strokeWidth,
  strokeCap,
  style,
  vectorNetwork,
  ...props
}: grida.program.document.IComputedNodeReactRenderProps<grida.program.nodes.PathNode>) {
  const width = Math.max(_width, 1);
  const height = Math.max(_height, 1);

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

  const d = svg.network.fromVectorNetwork(vectorNetwork);

  return (
    <svg
      {...queryattributes(props)}
      style={{
        ...style,
        overflow: "visible",
      }}
      width={width}
      height={height}
    >
      {fillDefs && <g dangerouslySetInnerHTML={{ __html: fillDefs }} />}
      {strokeDefs && <g dangerouslySetInnerHTML={{ __html: strokeDefs }} />}
      <path
        d={d}
        fill={fillDef}
        stroke={strokeDef}
        strokeWidth={strokeWidth}
        strokeLinecap={strokeCap}
      />
    </svg>
  );
}
