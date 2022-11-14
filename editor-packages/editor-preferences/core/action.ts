import React from "react";
import type { PreferenceState } from "./state";
import type { PreferencePageProps, Subset } from "./types";
type Preference = PreferenceState["config"];

export type Action =
  | PreferenceSetRouteAction
  | OpenPreferenceAction
  | ClosePreferenceAction
  | ConfigurationAction
  | RegisterPreferenceAction;

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

export type RegisterPreferenceAction = {
  type: "register";
  route: string;
  name: string;
  icon?: string;
  renderer: React.FC<PreferencePageProps>;
};
