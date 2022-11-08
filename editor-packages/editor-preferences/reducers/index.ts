import type { Action, PreferenceSetRouteAction, PreferenceState } from "core";

export function reducer(
  state: PreferenceState,
  action: Action
): PreferenceState {
  const { type } = action;
  switch (type) {
    case "route": {
      const { route } = <PreferenceSetRouteAction>action;
      return { ...state, route };
    }
  }
  return state;
}
