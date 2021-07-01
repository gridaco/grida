import React from "react";
import FigmaEmbed from "@reflect-blocks/figma-embed";

interface ProviderFigmaEmbedProps {
  url: string;
}
export function ProviderFigmaEmbed(props: ProviderFigmaEmbedProps) {
  return (
    <>
      <FigmaEmbed src={props.url} width="315px" height="712px" />
    </>
  );
}
