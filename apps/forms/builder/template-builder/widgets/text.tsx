import { grida } from "@/grida";

export const TextWidget = ({
  text,
  style,
  ...props
}: grida.program.document.IComputedNodeReactRenderProps<grida.program.nodes.TextNode>) => {
  const children = text?.toString();

  return (
    <div {...props} style={style}>
      {children}
    </div>
  );
};

TextWidget.type = "text";
