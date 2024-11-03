import { grida } from "@/grida";

export function SvgWidget({
  svg,
  width,
  height,
  style,
  ...props
}: grida.program.document.IComputedNodeReactRenderProps<grida.program.nodes.SvgNode>) {
  return (
    <svg
      {...props}
      style={style}
      width={width}
      height={height}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
