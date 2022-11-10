import type { Action } from "./action";

export type Dispatcher = (action: Action) => void;

export type PreferenceRouteInfo = {
  route: string;
  name: string;
  hidden?: boolean;
};
