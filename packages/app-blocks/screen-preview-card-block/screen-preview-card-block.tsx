import React from "react";
import styled from "@emotion/styled";
import { ProviderFigmaEmbed } from "./provider-figma-embed";
import { ProviderAnySnapshotView } from "./provider-any-snapshot-view";
import { ProviderSketchEmbed } from "./provider-sketch-embed";
import { ProviderUnknownIframeEmbed } from "./provider-unknown-iframe-embed";

export interface ScreenPreviewCardBlockProps {
  url: string;
  /**
   * if set to true, preview will show snapshot of the design as png format.
   * default fallback to true.
   */
  snapshot?: boolean;
}

export function ScreenPreviewCardBlock(props: ScreenPreviewCardBlockProps) {
  const { url } = props;
  const designprovider = analyzeDynamicPreviewUrl(url);

  switch (designprovider) {
    case "figma":
      return <ProviderFigmaEmbed url={url} />;
    case "snapshot":
      return <ProviderAnySnapshotView snapshot={url} />;
    case "sketch":
      return <ProviderSketchEmbed url={url} />;
    case "unknown":
      return <ProviderUnknownIframeEmbed url={url} />;
    case "nothing":
      return <>nothing:TODO</>;
  }
}

function analyzeDynamicPreviewUrl(url: string): DesignProvider | "snapshot" {
  try {
    const u = new URL(url);
    if (url.endsWith(".png")) {
      return "snapshot";
    }
    return analyzeDesignUrl(url);
  } catch (_) {
    throw _;
  }
}

type DesignProvider = "nothing" | "figma" | "sketch" | "unknown";
function analyzeDesignUrl(url: string): DesignProvider {
  try {
    const u = new URL(url);
    switch (u.hostname) {
      /**
       * https://figma.com/file/~
       */
      case "figma.com":
      case "www.figma.com":
        return "figma";
        break;
      /**
       * https://sketch.com/s/~
       */
      case "www.sketch.com":
      case "sketch.com":
        return "sketch";
        break;

      /**
       * powered by nothing graphics engine
       */
      case "www.grida.co":
      case "grida.co":
      case "www.nothing.app":
      case "nothing.app":
      case "www.bridged.xyz":
      case "bridged.xyz":
        return "nothing";
      default:
        return "unknown";
    }
  } catch (_) {
    // console.warn(`failed analyzing url. the url "${url}" is not a valid url.`)
    return "unknown";
  }
}
