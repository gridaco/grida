import React from "react";
import { embed, FigmaEmbedInput } from "@design-sdk/figma-url";
export function FigmaEmbedCanvas(props: {
  src: FigmaEmbedInput;
  width?: string | number;
  height?: string | number;
}) {
  const url = embed(props.src);

  if (url) {
    return (
      <iframe width={props.width ?? 375} height={props.height} src={url} />
    );
  }
  return <>NO FIGMA URL PROVIDED</>;
}
