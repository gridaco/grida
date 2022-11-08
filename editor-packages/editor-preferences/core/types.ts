import type { Action } from "./action";

export type Dispatcher = (action: Action) => void;

export type PreferenceRouteInfo = {
  id: string;
  name: string;
  items?: PreferenceRouteInfo[];
};
