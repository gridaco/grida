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
}: grida.program.document.INodeWithHtmlDocumentQueryDataAttributes<grida.program.nodes.ImageNode>) => {
  const { objectFit, objectPosition, ...divStyles } = style || {};
  const data_attributes = {
    "data-grida-node-id": props["data-grida-node-id"],
    "data-grida-node-type": props["data-grida-node-type"],
    "data-dev-editor-hovered": props["data-dev-editor-hovered"],
    "data-dev-editor-selected": props["data-dev-editor-selected"],
  } satisfies grida.program.document.INodeHtmlDocumentQueryDataAttributes;

  const img_element_props_without_data_attributes = {
    ...props,
    "data-grida-node-id": undefined,
    "data-grida-node-type": undefined,
    "data-dev-editor-hovered": undefined,
    "data-dev-editor-selected": undefined,
  };

  return (
    <div id={id} style={divStyles} {...data_attributes}>
      {src && (
        // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
        <img
          src={src as string}
          width={width}
          height={height}
          alt={alt}
          {...img_element_props_without_data_attributes}
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
