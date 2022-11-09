export type Action =
  | PreferenceSetRouteAction
  | OpenPreferenceAction
  | ClosePreferenceAction;
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
