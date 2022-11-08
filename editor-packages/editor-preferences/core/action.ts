export type Action = PreferenceSetRouteAction;
export type ActionType = PreferenceSetRouteAction["type"];

export type PreferenceSetRouteAction = {
  type: "route";
  route: string;
};
