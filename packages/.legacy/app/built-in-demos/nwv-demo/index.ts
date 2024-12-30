import { DemoDesignSnapshot } from "../demo-types";
import { mapper } from "@design-sdk/figma-remote";
import { convert } from "@design-sdk/figma-node-conversion";
import ___DEMO_NWV_MAIN_PAGE_DESIGN_FIGMA_REMOTE_DATA from "./_data.json";
export const _DEMO_NWV_MAIN_PAGE_DESIGN_FIGMA_URL =
  "https://www.figma.com/file/x7RRK6RwWtZuNakmbMLTVH/examples?node-id=1%3A120";

export const _DEMO_NWV_MAIN_PAGE_DESIGN_FIGMA_SNAPSHOT: DemoDesignSnapshot = {
  id: "demo-nwv-main-page",
  url: _DEMO_NWV_MAIN_PAGE_DESIGN_FIGMA_URL,
  node: (() => {
    const _mapped = mapper.mapFigmaRemoteToFigma(
      ___DEMO_NWV_MAIN_PAGE_DESIGN_FIGMA_REMOTE_DATA as any
    );
    const _converted = convert.intoReflectNode(_mapped, null, "rest");
    return _converted;
  })(), //
  name: `Newest World Vibes`,
  source: "figma",
};
