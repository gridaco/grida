import React from "react";
import { FigmaEmbedInput } from "@design-sdk/figma-url";
import { FigmaEmbed } from "@reflect-blocks/figma-embed";
export function AsisPreviewFigmaEmbed(props: {
  src: FigmaEmbedInput;
  width?: string;
  height?: string;
}) {
  return <FigmaEmbed {...props} />;
}
