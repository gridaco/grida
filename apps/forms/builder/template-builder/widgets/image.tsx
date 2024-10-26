import React from "react";
import { grida } from "@/grida";

export const ImageWidget = ({
  id,
  src,
  alt,
  width,
  height,
  style,
  ...props
}: grida.program.nodes.ImageNode) => {
  const { objectFit, objectPosition, ...divStyles } = style || {};

  return (
    <div id={id} style={divStyles}>
      {/* eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text */}
      {src && (
        <img
          src={src}
          width={width}
          height={height}
          alt={alt}
          {...props}
          style={{
            width: "100%",
            height: "100%",
            objectFit,
            objectPosition,
          }}
        />
      )}
    </div>
  );
};

ImageWidget.type = "image";
