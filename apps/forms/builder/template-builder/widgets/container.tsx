import React from "react";
import { withTemplate } from "../with-template";

export const ContainerWidget = withTemplate(
  ({
    style,
    children,
    ...props
  }: React.PropsWithChildren<{
    style?: React.CSSProperties;
  }>) => {
    return (
      <div {...props} style={style}>
        {children}
      </div>
    );
  },
  "container"
);
