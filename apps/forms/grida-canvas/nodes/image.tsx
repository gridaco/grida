import React from "react";
import { grida } from "@/grida";
import queryattributes from "./utils/attributes";

export const ImageWidget = ({
  src,
  alt,
  width,
  height,
  style,
  ...props
}: grida.program.document.IComputedNodeReactRenderProps<grida.program.nodes.ImageNode>) => {
  const { objectFit, objectPosition, ...divStyles } = style || {};

  const img_element_props_without_data_attributes = {
    ...props,
    "data-grida-node-id": undefined,
    "data-grida-node-type": undefined,
    "data-dev-editor-hovered": undefined,
    "data-dev-editor-selected": undefined,
  };

  return (
    <div
      style={{ ...divStyles, overflow: "hidden" }}
      {...queryattributes(props)}
    >
      {src && (
        // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
        <img
          src={src as string}
          width={grida.program.css.toDimension(width)}
          height={grida.program.css.toDimension(height)}
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
