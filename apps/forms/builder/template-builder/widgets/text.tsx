import { grida } from "@/grida";
import { withTemplate } from "../with-template";

export const TextWidget = withTemplate(
  ({ text, style, ...props }: grida.program.nodes.TextNode) => {
    const children = text.toString();

    return (
      <div {...props} style={style}>
        {children}
      </div>
    );
  },
  "text"
);
