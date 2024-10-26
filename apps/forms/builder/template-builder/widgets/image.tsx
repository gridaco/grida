import React from "react";
import { withTemplate } from "../with-template";
import { grida } from "@/grida";

export const ImageWidget = withTemplate(
  ({
    src,
    alt,
    width,
    height,
    style,
    ...props
  }: grida.program.nodes.ImageNode) => {
    return (
      // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
      <img
        src={src}
        width={width}
        height={height}
        alt={alt}
        {...props}
        style={style}
      />
    );
  },
  "image"
);
