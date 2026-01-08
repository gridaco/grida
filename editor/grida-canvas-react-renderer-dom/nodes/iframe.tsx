import React from "react";
import queryattributes from "./utils/attributes";
import grida from "@grida/schema";
import { css } from "@/grida-canvas-utils/css";

export const IFrameWidget = ({
  style,
  layout_target_width: width,
  layout_target_height: height,
  src,
  ...props
}: grida.program.document.IComputedNodeReactRenderProps<grida.program.nodes.HTMLIFrameNode>) => {
  return (
    <iframe
      src={src as string}
      width={css.toDimension(width)}
      height={css.toDimension(height)}
      {...queryattributes(props)}
      style={style}
    />
  );
};

IFrameWidget.type = "iframe";
