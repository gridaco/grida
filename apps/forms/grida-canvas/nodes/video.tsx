import React from "react";
import { grida } from "@/grida";
import queryattributes from "./utils/attributes";

export const VideoWidget = ({
  src,
  poster,
  width,
  height,
  style,
  ...props
}: grida.program.document.IComputedNodeReactRenderProps<grida.program.nodes.VideoNode>) => {
  const { objectFit, objectPosition, ...divStyles } = style || {};

  const video_element_props_without_data_attributes = {
    ...props,
    "data-grida-node-id": undefined,
    "data-grida-node-type": undefined,
    "data-dev-editor-hovered": undefined,
    "data-dev-editor-selected": undefined,
  };

  return (
    <div
      {...queryattributes(props)}
      style={{ ...divStyles, overflow: "hidden" }}
    >
      {src && (
        // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
        <video
          src={src as string}
          poster={poster as string}
          width={grida.program.css.toDimension(width)}
          height={grida.program.css.toDimension(height)}
          {...video_element_props_without_data_attributes}
          loop={props.loop}
          muted={props.muted}
          autoPlay={props.autoplay}
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

VideoWidget.type = "video";
