import React from "react";

export function FigmaEmbedCanvas(props: { url?: string }) {
  if (props.url) {
    /**
     * build embedding url. - https://www.figma.com/developers/embed
     */
    const _embed_url = `https://www.figma.com/embed?embed_host=astra&url=${props.url}`;
    return <iframe width={300} height={600} src={_embed_url} />;
  }
  return <>NO FIGMA URL PROVIDED</>;
}
