import { grida } from "@/grida";

/**
 * @deprecated - not ready - do not use in production
 * @returns
 */
export function VectorWidget({
  path,
  width,
  height,
  ...props
}: grida.program.document.IComputedNodeReactRenderProps<grida.program.nodes.VectorNode>) {
  // const svgDataUri = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

  return (
    <svg {...props} width={width} height={height}>
      <path d={path} />
    </svg>
  );
}
