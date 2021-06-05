import { NextRouter } from "next/router";

const P_FIGMA_TARGET_URL = "figma_target_url";

export interface FigmaToReactRouterQueryParams {
  figma_target_url: string;
}

export function extractFromFigmaQueryParams(router: NextRouter) {
  const targetUrl = (router.query as any)?.[P_FIGMA_TARGET_URL];
  return {
    figma_target_url: targetUrl,
  };
}

export function setFigmaTargetUrl(router: NextRouter, url: string) {
  ((router.query as any) as FigmaToReactRouterQueryParams).figma_target_url = url;
  router.push(router);
}
