import type {
  Action,
  OpenPreferenceAction,
  PreferenceSetRouteAction,
  PreferenceState,
} from "../core";

export function reducer(
  state: PreferenceState,
  action: Action
): PreferenceState {
  const { type } = action;
  switch (type) {
    case "open": {
      // todo init open with givven route.
      const { route } = <OpenPreferenceAction>action;

      if (state.open) {
        return state;
      } else {
        return {
          ...state,
          open: true,
        };
      }
    }
    case "close": {
      if (state.open) {
        return {
          ...state,
          open: false,
        };
      }
    }
    case "route": {
      const { route } = <PreferenceSetRouteAction>action;
      return { ...state, route };
    }
  }
  return state;
}
