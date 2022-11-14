import type { PreferenceRouteInfo } from "./types";
import type { FrameworkConfig } from "@grida/builder-config";
export interface PreferenceState {
  open: boolean;
  route: string;
  routes: PreferenceRouteInfo[];
  config: {
    debug: boolean;
    canvas: {
      renderer: "figma-renderer" | "vanilla-renderer" | "bitmap-renderer";
    };
    framework: FrameworkConfig;
    experimental: {
      preview_feature_components_support: "enabled" | "disabled";
    };
  };
}
