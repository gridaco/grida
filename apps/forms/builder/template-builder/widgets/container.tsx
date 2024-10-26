import React from "react";
import { withTemplate } from "../with-template";
import { grida } from "@/grida";

export const ContainerWidget = withTemplate(
  ({
    style,
    children,
    ...props
  }: React.PropsWithChildren<grida.program.nodes.ContainerNode>) => {
    return (
      <div {...props} style={style}>
        {children}
      </div>
    );
  },
  "container"
);
