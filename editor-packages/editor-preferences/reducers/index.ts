import type {
  Action,
  OpenPreferenceAction,
  PreferenceSetRouteAction,
  PreferenceState,
  ConfigurationAction,
  Subset,
} from "../core";
import { PreferencesStore } from "../store";

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
    case "configure": {
      const { update } = <ConfigurationAction>action;
      // update provided values from state.config with Subset "update", recursively.
      const config = merge(state.config, update);

      const store = new PreferencesStore();
      store.set(config);

      return {
        ...state,
        config,
      };
    }
  }
  return state;
}

/**
 * replace only provided value from b: Subset<T>
 * @param a
 * @param b
 * @returns
 */
function merge<T>(a: T, b: Subset<T>): T {
  for (const key in b) {
    if (typeof b[key] === "object") {
      if (a[key] === undefined) {
        (a[key] as unknown) = {};
      }
      merge(a[key], b[key]);
    } else {
      (a[key] as unknown) = b[key];
    }
  }
  return a;
}

const handleroute = (state: PreferenceState, route: string) => {
  if (route) {
    return { ...state, route };
  }
  return state;
};
