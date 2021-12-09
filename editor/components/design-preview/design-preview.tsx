import React from "react";
import { FigmaEmbedCanvas } from "components/canvas";

interface DesignPreviewConfig {
  fileid: string;
  sceneid: string;
  origin: "figma" | "sketch" | "xd" | "nothing";
  displayAs: "embed" | "static" | "nothing";
}

export function DesignPreview(props: {
  config: DesignPreviewConfig;
  width: string;
  height: string;
}) {
  const { config } = props;
  switch (config.origin) {
    case "figma":
      switch (config.displayAs) {
        case "embed":
          return (
            <FigmaEmbedCanvas
              src={{
                fileid: config.fileid,
                nodeid: config.sceneid, // scene id is node id here.
              }}
              width={props.width}
              height={props.height}
            />
          );
        case "static":
          throw "static image source is not provided";
        case "nothing":
          throw "nothing engine is in development";
      }
    default:
      throw `origin platform "${config.origin}" is not supporetd yet by scene previewer`;
  }
  return <>Scene preview somehow failed</>;
}
