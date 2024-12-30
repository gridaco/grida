import React from "react";

interface ProviderUnknownIframeEmbedProps {
  url: string;
}

export function ProviderUnknownIframeEmbed(
  props: ProviderUnknownIframeEmbedProps
) {
  return (
    <>
      <iframe src={props.url} />
    </>
  );
}
