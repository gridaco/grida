import React from "react";
import grida from "@grida/schema";
import queryattributes from "./utils/attributes";

export const TrayWidget = ({
  style,
  children,
  ...props
}: React.PropsWithChildren<
  grida.program.document.IComputedNodeReactRenderProps<grida.program.nodes.TrayNode>
>) => {
  return (
    <div {...queryattributes(props)} style={style}>
      {children}
    </div>
  );
};

TrayWidget.type = "tray";
