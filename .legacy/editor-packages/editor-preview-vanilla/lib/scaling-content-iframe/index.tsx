import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import styled from "@emotion/styled";
import { __dangerously_disable_scroll_in_html_body } from "../utils/remove-scroll";

const _DEFAULT_MARGIN = 0;
const _DEFAULT_SHADOW = "0px 0px 0px transparent";
const _DEFAULT_BORDER_RADIUS = 0;

interface HtmlViewFrameProps {
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
}

interface FrameStylingProps {
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

  /**
   * when true, disables inner iframe scroll by modifying root elements style (dangerously)
   */
  disableScroll?: boolean;
}

export interface ScalingHtmlContentFrameProps
  extends HtmlViewFrameProps,
    FrameStylingProps {
  type: "scaling";

  /**
   * parent size of this frame for scaling & marginal calculation
   */
  parentWidth: number;

  /**
   * margin for the iframe to be placed
   *
   * @default 12
   */
  margin?: number;

  /**
   * the max scale of the autoscaling value. (defaults to 1).
   * set `"auto"` to enable autoscaling.
   *
   * @default 1
   */
  maxScale?: number | "auto";

  onScaleChange?: (scale: number, margin: number) => void;
}

export function ScalingContentIframe({
  onScaleChange,
  disableScroll,
  parentWidth,
  maxScale = 1,
  margin = 12,
  ...props
}: ScalingHtmlContentFrameProps) {
  const [scalefactor, setscalefactor] = useState(1);
  const iframeRef = useRef<HTMLIFrameElement>(undefined);

  // dangerously remove scrolling for inner ifram html
  // ask: @softmarshmallow
  useLayoutEffect(() => {
    if (iframeRef.current) {
      if (disableScroll) {
        __dangerously_disable_scroll_in_html_body(iframeRef.current);
      }
    }
  }, [iframeRef, props.data]);

  useEffect(() => {
    if (props && parentWidth) {
      const _s = (parentWidth - margin * 2) / props.origin_size.width;
      const framescale =
        typeof maxScale == "number" ? Math.min(_s, maxScale) : _s;
      onScaleChange(framescale, margin);
      setscalefactor(framescale);
    }
  }, [parentWidth, props?.id]);

  return (
    <PlainIframe
      key={props.id}
      id="preview-iframe"
      ref={iframeRef}
      width={props?.origin_size?.width ?? 0}
      height={props?.origin_size?.height ?? 0}
      sandbox="allow-same-origin"
      margin={margin}
      borderRadius={allow_0(props?.borderRadius, _DEFAULT_BORDER_RADIUS)}
      boxShadow={props?.boxShadow ?? _DEFAULT_SHADOW}
      inner_view_ready={props.data !== undefined}
      srcDoc={props.data}
      scale={scalefactor}
    />
  );
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
