import type { PreferenceState } from "./state";
import type { Subset } from "./types";
type Preference = PreferenceState["config"];

export type Action =
  | PreferenceSetRouteAction
  | OpenPreferenceAction
  | ClosePreferenceAction
  | ConfigurationAction;

export type ActionType = PreferenceSetRouteAction["type"];

export type PreferenceSetRouteAction = {
  type: "route";
  route: string;
};

export type OpenPreferenceAction = {
  type: "open";
  route?: string;
};

export type ClosePreferenceAction = {
  type: "close";
};

export type ConfigurationAction = {
  type: "configure";
  update: Subset<Preference>;
};
