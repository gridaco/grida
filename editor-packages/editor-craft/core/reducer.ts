import { Action } from "./action";
import { State } from "./state";

export function reducer(state: State, action: Action): State {
  return { ...state };
}
