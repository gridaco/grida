import type { PreferenceRouteInfo } from "./types";

export interface PreferenceState {
  open: boolean;
  route: string;
  routes: PreferenceRouteInfo[];
}
