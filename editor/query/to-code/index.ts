import { useRouter } from "next/router";
import { useEffect, useState } from "react";
import { DesignProvider, analyzeDesignUrl } from "@design-sdk/url-analysis";
/**
 * query param for design input
 */
const P_DESIGN = "design";

export function useDesign() {
  const [design, setDesign] = useState<string>(null);
  const router = useRouter();
  useEffect(() => {
    const designparam: string = router.query[P_DESIGN] as string;
    if (designparam) {
      const _r = analyze(designparam);
      switch (_r) {
        case "id":
          // todo
          // load design from local storage
          setDesign(designparam);
          break;
        case "figma":
          // todo
          // load design from local storage or remote figma
          setDesign(designparam);
          break;
        default:
          // other platforms are not supported yet
          break;
      }
    }
  }, []);
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
