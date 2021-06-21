import React from "react";
import { url as urlutil } from "@design-sdk/figma";

interface ProviderFigmaEmbedProps {
  url: string;
}
export function ProviderFigmaEmbed(props: ProviderFigmaEmbedProps) {
  const url = urlutil.buildFigmaEmbedUrl({
    url: props.url,
  });

  return (
    <>
      <iframe src={url} />
    </>
  );
}
