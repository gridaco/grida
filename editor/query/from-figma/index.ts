import {
  FigmaTargetNodeConfig,
  parseFileAndNodeId,
} from "@design-sdk/figma-url";
import { Figma, nodes, remote } from "@design-sdk/figma";
import { NextRouter, useRouter } from "next/router";
import { useEffect, useState } from "react";
import { fetch } from "@design-sdk/figma-remote";
import { utils_figma } from "../../utils";
import { TargetNodeConfig as _TargetNodeConfig } from "../target-node";

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

/**
 * NextJS Hook that retrieves query param "figma_target_url"
 */
export function useFigmaTargetUrl() {
  const router = useRouter();
  const [figma_target_url, set_figma_target_url] = useState<string>();
  useEffect(() => {
    const q: FigmaToReactRouterQueryParams = router.query as any;
    const _figma_target_url = q.figma_target_url;
    set_figma_target_url(_figma_target_url);
  }, [router]);

  return figma_target_url;
}

export function useFigmaTargetNode() {
  const figmaTargetUrl = useFigmaTargetUrl();
  const [targetNode, setTargetNode] = useState<FigmaTargetNodeConfig>();
  useEffect(() => {
    if (figmaTargetUrl) {
      const targetnodeconfig = parseFileAndNodeId(figmaTargetUrl);
      setTargetNode(targetnodeconfig);
    }
  }, [figmaTargetUrl]);

  return targetNode;
}

export interface TargetNodeConfig
  extends _TargetNodeConfig<remote.api.Node, Figma.SceneNode> {
  remote: remote.api.Node;
  figma: Figma.SceneNode;
  reflect: nodes.ReflectSceneNode;
  url: string;
  file: string;
  node: string;
}

export function useReflectTargetNode() {
  const figmaTargetNode = useFigmaTargetNode();
  const [targetNode, setTargetNode] = useState<TargetNodeConfig>();
  useEffect(() => {
    if (figmaTargetNode) {
      fetch
        .fetchTargetAsReflect(figmaTargetNode.file, figmaTargetNode.node, {
          personalAccessToken: utils_figma.figmaPersonalAccessToken_safe(),
        })
        .then((res) => {
          setTargetNode(<TargetNodeConfig>{
            ...res,
            ...figmaTargetNode,
          });
        });
    }
  }, [figmaTargetNode]);

  return targetNode;
}
