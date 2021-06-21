import React from "react";
import { url as urlutil } from "@design-sdk/figma";
export function FigmaEmbedCanvas(props: {
  src: urlutil.FigmaEmbedInput;
  width?: string | number;
  height?: string | number;
}) {
  const url = urlutil.buildFigmaEmbedUrl(props.src);

  if (url) {
    return (
      <iframe width={props.width ?? 375} height={props.height} src={url} />
    );
  }
  return <>NO FIGMA URL PROVIDED</>;
}
