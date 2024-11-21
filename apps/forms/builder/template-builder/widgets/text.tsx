import React from "react";
import { grida } from "@/grida";

export const TextWidget = ({
  text,
  style,
  ...props
}: grida.program.document.IComputedNodeReactRenderProps<grida.program.nodes.TextNode>) => {
  const children = text?.toString();

  return (
    <div {...props} style={style}>
      {children?.split("\n").map((line, index) => (
        <React.Fragment key={index}>
          {line}
          <br />
        </React.Fragment>
      ))}
    </div>
  );
};

TextWidget.type = "text";
