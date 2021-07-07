import React from "react";
import styled from "@emotion/styled";
import { ProviderFigmaEmbed } from "./provider-figma-embed";
import { ProviderAnySnapshotView } from "./provider-any-snapshot-view";
import { ProviderSketchEmbed } from "./provider-sketch-embed";
import { ProviderUnknownIframeEmbed } from "./provider-unknown-iframe-embed";
import { DesignProvider, analyzeDesignUrl } from "@design-sdk/url-analysis";
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
    case "grida":
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
