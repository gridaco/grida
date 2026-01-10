import React from "react";
import type grida from "@grida/schema";
import queryattributes from "./utils/attributes";

export const TextSpanWidget = ({
  text,
  style,
  max_lines,
  ...props
}: grida.program.document.IComputedNodeReactRenderProps<grida.program.nodes.TextSpanNode>) => {
  const children = text?.toString();

  return (
    <div {...queryattributes(props)} style={style}>
      {children}
    </div>
  );
};

TextSpanWidget.type = "tspan";
