import React from "react";
import { grida } from "@/grida";

export const ContainerWidget = ({
  style,
  children,
  ...props
}: React.PropsWithChildren<
  grida.program.document.IComputedNodeReactRenderProps<grida.program.nodes.ContainerNode>
>) => {
  return (
    <div {...props} style={style}>
      {children}
    </div>
  );
};

ContainerWidget.type = "container";
