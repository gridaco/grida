import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import styled from "@emotion/styled";

const _DEFAULT_MARGIN = 0;
const _DEFAULT_SHADOW = "0px 0px 0px transparent";
const _DEFAULT_BORDER_RADIUS = 0;

export interface ResponsiveContentIframeProps {
  type: "responsive";
  /**
   * the vanilla html code or remote embeddable web url;
   */
  data?: string;
  /**
   * show responsive view of.
   */
  of?: string;

  id: string;

  /**
   * the origin size of the design
   */
  origin_size: {
    width: number;
    height: number;
  };

  /**
   * margin for the iframe to be placed
   *
   * @default 12
   */
  margin?: number;

  /**
   * border radius of iframe container
   *
   * @default 4
   */
  borderRadius?: number;

  /**
   * boxshadow css as string
   *
   * @default "0px 4px 64px rgba(160, 160, 160, 0.18)"
   */
  boxShadow?: string;
}

export function ResponsiveContentIframe({
  previewInfo,
  parentSize,
  onScaleChange,
}: {
  onScaleChange: (scale: number) => void;
  previewInfo: ResponsiveContentIframeProps;
  parentSize: { width: number; height: number };
}) {
  const margin = allow_0(previewInfo.margin, _DEFAULT_MARGIN);

  const [scalefactor, setscalefactor] = useState(1);
  const iframeRef = useRef<HTMLIFrameElement>(undefined);

  // dangerously remove scrolling for inner ifram html
  // ask: @softmarshmallow
  useLayoutEffect(() => {
    if (iframeRef.current) {
      __dangerously_disable_scroll_in_html_body(iframeRef.current);
    }
  }, [iframeRef, previewInfo.data]);

  useEffect(() => {
    if (previewInfo && parentSize.width) {
      const _s =
        (parentSize.width - margin * 2) / previewInfo.origin_size.width;
      const framescale = Math.min(_s, 1);
      onScaleChange(framescale);
      setscalefactor(framescale);
    }
  }, [parentSize.width, parentSize.height, previewInfo?.id]);

  return (
    <PlainIframe
      key={previewInfo.id}
      id="preview-iframe"
      ref={iframeRef}
      width={previewInfo?.origin_size?.width ?? 0}
      height={previewInfo?.origin_size?.height ?? 0}
      sandbox="allow-same-origin"
      margin={margin}
      borderRadius={allow_0(previewInfo?.borderRadius, _DEFAULT_BORDER_RADIUS)}
      boxShadow={previewInfo?.boxShadow ?? _DEFAULT_SHADOW}
      inner_view_ready={previewInfo.data !== undefined}
      srcDoc={previewInfo.data}
      scale={scalefactor}
    />
  );
}

/**
 * this is a explicit temporary solution to disable iframe content to be scrolling. we aleardy disable scrolling a root element inside the body, but when the element is big and the scale factor is not persice enough, the scrollbar will be shown.
 * @ask: @softmarshmallow
 * @param iframe
 */
function __dangerously_disable_scroll_in_html_body(iframe: HTMLIFrameElement) {
  try {
    iframe.contentDocument.getElementsByTagName("body")[0].style.overflow =
      "hidden";
  } catch (_) {
    if (process.env.NODE_ENV === "development") {
      console.error("__dangerously_disable_scroll_in_html_body", _);
    }
  }
}

/**
 * allow falsy number `0` as a valid value, + use default value if `null` | `undefined`
 * @returns
 */
function allow_0(i: number, defaultValue = 0): number {
  return typeof i === "number" ? i : defaultValue;
}

const PlainIframe = styled.iframe<{
  scale: number;
  margin: number;
  borderRadius: number;
  boxShadow: string;
  inner_view_ready: boolean;
}>`
  background: ${(p) => (p.inner_view_ready ? "white" : "transparent")};
  box-shadow: ${(p) => p.boxShadow};
  outline: none;
  overflow: hidden;
  border-radius: ${(p) => p.borderRadius}px;
  margin: ${(props) => props.margin}px;
  border: none;
  transform: ${(props) => `scale(${props.scale})`};
  /* when height smaller, center center */
  /* else, center top */
  /* TODO: the logic is incomplete */
  transform-origin: center top;
  /* transform-origin: center ${(p) => (p.scale < 1 ? "center" : "top")}; */
`;
