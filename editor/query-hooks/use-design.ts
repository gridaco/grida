import { useRouter } from "next/router";
import { useEffect, useState } from "react";
import { DesignProvider, analyzeDesignUrl } from "@design-sdk/url-analysis";
import {
  FigmaTargetNodeConfig,
  parseFileAndNodeId,
} from "@design-sdk/figma-url";
import { fetch } from "@design-sdk/figma-remote";
import { personal } from "@design-sdk/figma-auth-store";
import { configure_auth_credentials } from "@design-sdk/figma-remote";
import { TargetNodeConfig } from "../query/target-node";
import { FigmaRemoteErrors } from "@design-sdk/figma-remote/lib/fetch";
import { RemoteDesignSessionCacheStore } from "../store";
import { convert } from "../../packages/design-sdk/figma-node-conversion";
import { mapFigmaRemoteToFigma } from "../../packages/design-sdk/figma-remote/lib/mapper";

// globally configure auth credentials for interacting with `@design-sdk/figma-remote`
configure_auth_credentials({
  personalAccessToken: personal.get_safe(),
});

/**
 * query param for design input
 */
const P_DESIGN = "design";

export function useDesign(
  options: { use_session_cache?: boolean } = { use_session_cache: true }
) {
  const [design, setDesign] = useState<TargetNodeConfig>(null);
  const router = useRouter();
  useEffect(() => {
    const designparam: string = router.query[P_DESIGN] as string;
    let targetnodeconfig: FigmaTargetNodeConfig;
    if (designparam) {
      const _r = analyze(designparam);
      switch (_r) {
        case "id":
          // todo
          // load design from local storage
          // setDesign(designparam);
          break;
        case "figma":
          // load design from local storage or remote figma
          targetnodeconfig = parseFileAndNodeId(designparam);
          const cacheStore = new RemoteDesignSessionCacheStore({
            url: targetnodeconfig.url,
          });
          // cache control
          if (options.use_session_cache && cacheStore.exists) {
            const last_response = cacheStore.get();
            const _1_converted_to_figma = mapFigmaRemoteToFigma(
              last_response.nodes[targetnodeconfig.node]
            );
            const _2_converted_to_reflect = convert.intoReflectNode(
              _1_converted_to_figma
            );
            setDesign(<TargetNodeConfig>{
              ...targetnodeconfig,
              raw: last_response,
              figma: _1_converted_to_figma,
              reflect: _2_converted_to_reflect,
            });
          } else {
            fetch
              .fetchTargetAsReflect({
                file: targetnodeconfig.file,
                node: targetnodeconfig.node,
                auth: {
                  personalAccessToken: personal.get_safe(),
                },
              })
              .then((res) => {
                cacheStore.set(res.raw); // setting cache does not need to be determined by `use_session_cache` option.
                setDesign(<TargetNodeConfig>{
                  ...res,
                  ...targetnodeconfig,
                });
              })
              .catch((err: FigmaRemoteErrors) => {
                switch (err.type) {
                  case "UnauthorizedError": {
                    // unauthorized
                    router.push("/preferences/access-tokens");
                    console.info(`(ignored) error while fetching design`, err);
                    break;
                  }
                  default:
                    throw err;
                }
              });
          }

          break;
        default:
          break;
      }
    }
  }, [router]);
  return design;
}

const analyze = (query: string): "id" | DesignProvider => {
  const _r = analyzeDesignUrl(query);
  if (_r == "unknown") {
    return "id";
  } else {
    return _r;
  }
};
