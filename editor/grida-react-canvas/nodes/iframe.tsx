import React from "react";
import queryattributes from "./utils/attributes";
import { grida } from "@/grida";
import { css } from "@/grida/css";

export const IFrameWidget = ({
  style,
  width,
  height,
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
