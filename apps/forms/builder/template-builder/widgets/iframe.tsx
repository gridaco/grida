import React from "react";
import { grida } from "@/grida";

export const ContainerWidget = ({
  style,
  width,
  height,
  src,
  srcdoc,
  ...props
}: grida.program.document.IComputedNodeReactRenderProps<grida.program.nodes.HTMLIFrameNode>) => {
  return (
    <iframe
      src={src as string}
      srcDoc={srcdoc as string}
      width={grida.program.css.toDimension(width)}
      height={grida.program.css.toDimension(height)}
      {...props}
      style={style}
    />
  );
};

ContainerWidget.type = "container";
