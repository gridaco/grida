import { z } from "zod";
import { withTemplate, ZTemplateSchema } from "../with-template";
import React from "react";

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
