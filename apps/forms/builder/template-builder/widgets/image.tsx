import React from "react";
import { withTemplate } from "../with-template";

export const ImageWidget = withTemplate(
  ({
    style,
    children,
    properties: { src },
    ...props
  }: React.PropsWithChildren<{
    style?: React.CSSProperties;
    properties: {
      src: string;
    };
  }>) => {
    return (
      // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
      <img src={src} {...props} style={style}>
        {children}
      </img>
    );
  },
  "image"
);
