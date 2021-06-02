import React from "react";

type EmbedInput = { url: string } | { fileid: string; nodeid?: string };
export function FigmaEmbedCanvas(props: { src: EmbedInput }) {
  const url = builEmbedabledUrl(props.src);

  if (url) {
    /**
     * build embedding url. - https://www.figma.com/developers/embed
     */
    const _embed_url = `https://www.figma.com/embed?embed_host=astra&url=${url}`;
    return <iframe width={300} height={600} src={_embed_url} />;
  }
  return <>NO FIGMA URL PROVIDED</>;
}

/**
 * e.g. - https://www.figma.com/file/HSozKEVWhh8saZa2vr1Nxd?node-id=111%3A0
 * @param src : ;
 * @returns
 */
function builEmbedabledUrl(src?: EmbedInput): string | undefined {
  if (!src) {
    return;
  }

  if ("url" in src) {
    return src.url;
  } else if ("fileid" in src) {
    /// WWW prefix is required. if non passed, figma embed won't accept it.
    return `https://www.figma.com/file/${src.fileid}/${
      src.nodeid && `?node-id=${src.nodeid}`
    }`;
  } else {
    return undefined;
  }
}
