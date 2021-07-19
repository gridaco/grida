import { useRouter } from "next/router";
import { useEffect, useState } from "react";
import { DesignProvider, analyzeDesignUrl } from "@design-sdk/url-analysis";
import { parseFileAndNodeId } from "@design-sdk/figma-url";
import { fetch } from "@design-sdk/figma-remote";
import { personal } from "@design-sdk/figma-auth-store";
import { TargetNodeConfig } from "../target-node";
/**
 * query param for design input
 */
const P_DESIGN = "design";

export function useDesign() {
  const [design, setDesign] = useState<TargetNodeConfig>(null);
  const router = useRouter();
  useEffect(() => {
    const designparam: string = router.query[P_DESIGN] as string;
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
          const targetnodeconfig = parseFileAndNodeId(designparam);
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
            });

          break;
        default:
          // other platforms are not supported yet
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
