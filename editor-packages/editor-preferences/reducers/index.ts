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
        return handleroute(state, route);
      } else {
        return {
          ...handleroute(state, route),
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
      return handleroute(state, route);
    }
  }
  return state;
}

const handleroute = (state: PreferenceState, route: string) => {
  if (route) {
    return { ...state, route };
  }
  return state;
};
