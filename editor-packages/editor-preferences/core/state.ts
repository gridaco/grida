import type { PreferencePageProps, PreferenceRouteInfo } from "./types";
import type { FrameworkConfig } from "@grida/builder-config";
export interface PreferenceState {
  open: boolean;
  route: string;
  routes: PreferenceRouteInfo[];
  renderers: {
    [key: string]: React.FC<PreferencePageProps>;
  };
  config: {
    /**
     * @beta
     * @deprecated
     */
    debug: boolean;
    canvas: {
      renderer:
        | "d2c-vanilla-iframe-renderer"
        | "bitmap-renderer"
        | "htmlcss-vanilla-renderer"; // "figma-renderer"
    };
    framework: FrameworkConfig;
    experimental: {
      /**
       * @beta
       */
      preview_feature_components_support: "enabled" | "disabled";
    };
    /**
     * @beta
     */
    theme: "light" | "dark";
  };
}
