import React from "react";
import styled from "@emotion/styled";

interface ScreenPreviewCardBlockProps {
  url: string;
  /**
   * if set to true, preview will show snapshot of the design as png format
   */
  snapshot?: boolean;
}

export function ScreenPreviewCardBlock(props: ScreenPreviewCardBlockProps) {
  const { url } = props;
  const designprovider = analyzeDesignUrl(url);
  return <></>;
}

function analyzeDesignUrl(
  url: string
): "nothing" | "figma" | "sketch" | "unknown" {
  try {
    const u = new URL(url);
    switch (u.hostname) {
      /**
       * https://figma.com/file/~
       */
      case "figma.com":
        return "figma";
        break;
      /**
       * https://sketch.com/s/~
       */
      case "sketch.com":
        return "sketch";
        break;

      /**
       * powered by nothing graphics engine
       */
      case "grida.co":
      case "nothing.app":
      case "bridged.xyz":
        return "nothing";
        break;
      default:
        return "unknown";
    }
  } catch (_) {
    throw `failed analyzing url. the url "${url}" is not a valid url.`;
  }
}
