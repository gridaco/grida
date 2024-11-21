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
          {/* to keep white space wrap behaviour, replace starting from 2 sequence */}
          {line.replace(/ {2,}/g, (match) => match.replace(/ /g, "\u00a0"))}
          <br />
        </React.Fragment>
      ))}
    </div>
  );
};

TextWidget.type = "text";
