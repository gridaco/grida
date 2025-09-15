import React from "react";
import type grida from "@grida/schema";
import queryattributes from "./utils/attributes";

export const TextWidget = ({
  text,
  style,
  maxLines,
  ...props
}: grida.program.document.IComputedNodeReactRenderProps<grida.program.nodes.TextNode>) => {
  const children = text?.toString();

  return (
    <div {...queryattributes(props)} style={style}>
      {children}
    </div>
  );
};

TextWidget.type = "text";
