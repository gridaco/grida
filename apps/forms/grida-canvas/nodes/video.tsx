import React from "react";
import { grida } from "@/grida";
import queryattributes from "./utils/attributes";

export const VideoWidget = ({
  src,
  poster,
  width,
  height,
  loop,
  muted,
  autoplay,
  style,
  ...props
}: grida.program.document.IComputedNodeReactRenderProps<grida.program.nodes.VideoNode>) => {
  const { objectFit, objectPosition, ...divStyles } = style || {};

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
          loop={loop}
          muted={muted}
          autoPlay={autoplay}
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
