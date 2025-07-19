import React from "react";
import queryattributes from "./utils/attributes";
import grida from "@grida/schema";
import { css } from "@/grida-canvas-utils/css";

export const ImageWidget = ({
  src,
  alt,
  width,
  height,
  style,
  ...props
}: grida.program.document.IComputedNodeReactRenderProps<grida.program.nodes.ImageNode>) => {
  const { objectFit, objectPosition, ...divStyles } = style || {};

  return (
    <div
      style={{ ...divStyles, overflow: "hidden" }}
      {...queryattributes(props)}
    >
      {src && (
        // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
        <img
          src={src as string}
          width={css.toDimension(width)}
          height={css.toDimension(height)}
          alt={alt}
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
