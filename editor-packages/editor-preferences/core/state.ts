import type { PreferenceRouteInfo } from "./types";
import type { FrameworkConfig } from "@grida/builder-config";
export interface PreferenceState {
  open: boolean;
  route: string;
  routes: PreferenceRouteInfo[];
  config: {
    /**
     * @beta
     * @deprecated
     */
    debug: boolean;
    canvas: {
      renderer: "vanilla-renderer" | "bitmap-renderer"; // "figma-renderer"
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
