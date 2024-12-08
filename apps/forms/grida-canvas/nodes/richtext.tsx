import React from "react";
import { grida } from "@/grida";

export const RichTextWidget = ({
  html,
  style,
  ...props
}: grida.program.document.IComputedNodeReactRenderProps<grida.program.nodes.HTMLRichTextNode>) => {
  const __html = html?.toString() ?? "";

  return (
    <div {...props} style={style}>
      <div dangerouslySetInnerHTML={{ __html }} />
    </div>
  );
};

RichTextWidget.type = "richtext";
