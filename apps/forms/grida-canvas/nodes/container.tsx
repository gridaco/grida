import React from "react";
import { grida } from "@/grida";
import queryattributes from "./utils/attributes";

export const ContainerWidget = ({
  style,
  children,
  ...props
}: React.PropsWithChildren<
  grida.program.document.IComputedNodeReactRenderProps<grida.program.nodes.ContainerNode>
>) => {
  return (
    <div {...queryattributes(props)} style={style}>
      {children}
    </div>
  );
};

ContainerWidget.type = "container";
