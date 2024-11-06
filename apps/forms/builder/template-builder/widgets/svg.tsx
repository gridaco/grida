import { grida } from "@/grida";

/**
 * @deprecated - not ready - do not use in production
 * @returns
 */
export function SvgWidget({
  svg,
  width,
  height,
  style,
  ...props
}: grida.program.document.IComputedNodeReactRenderProps<grida.program.nodes.SvgNode>) {
  const svgDataUri = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

  return (
    <div
      {...props}
      style={{
        ...style,
        // width, // Controls the outer container's width
        // height, // Controls the outer container's height
        overflow: "hidden", // Ensures no overflow if SVG extends outside bounds
      }}
    >
      <img
        src={svgDataUri}
        style={{
          width: "100%", // Makes SVG scale to fill container width
          height: "100%", // Makes SVG scale to fill container height
          display: "block", // Prevents inline display issues
        }}
      />
    </div>
  );
}
