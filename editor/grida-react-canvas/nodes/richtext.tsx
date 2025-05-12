import React from "react";
import grida from "@grida/schema";
import queryattributes from "./utils/attributes";

export const RichTextWidget = ({
  html,
  style,
  ...props
}: grida.program.document.IComputedNodeReactRenderProps<grida.program.nodes.HTMLRichTextNode>) => {
  const __html = html?.toString() ?? "";

  return (
    <div {...queryattributes(props)} style={style}>
      <div dangerouslySetInnerHTML={{ __html }} />
    </div>
  );
};

RichTextWidget.type = "richtext";
