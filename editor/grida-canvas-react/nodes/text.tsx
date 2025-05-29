import React from "react";
import type grida from "@grida/schema";
import queryattributes from "./utils/attributes";

export const TextWidget = ({
  text,
  style,
  ...props
}: grida.program.document.IComputedNodeReactRenderProps<grida.program.nodes.TextNode>) => {
  const children = text?.toString();

  return (
    <div {...queryattributes(props)} style={style}>
      <span style={{ whiteSpace: "pre" }}>{children}</span>
    </div>
  );
};

TextWidget.type = "text";
