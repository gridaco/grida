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

// globally configure auth credentials for interacting with `@design-sdk/figma-remote`
configure_auth_credentials({
  personalAccessToken: personal.get_safe(),
});

/**
 * query param for design input
 */
const P_DESIGN = "design";

export function useDesign() {
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
          fetch
            .fetchTargetAsReflect(
              targetnodeconfig.file,
              targetnodeconfig.node,
              {
                personalAccessToken: personal.get_safe(),
              }
            )
            .then((res) => {
              setDesign(<TargetNodeConfig>{
                ...res,
                ...targetnodeconfig,
              });
            })
            .catch((err) => {
              if (err.status == 401) {
                // unauthorized
                router.push("/preferences/access-tokens");
                console.info(`(ignored) error while fetching design`, err);
              }
              throw err;
            });

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
