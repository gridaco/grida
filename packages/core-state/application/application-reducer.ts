import { Action } from "../action";
import { ApplicationState } from "../application";
import { pageReducer } from "../page";

export function applicationReducer(
  state: ApplicationState,
  action: Action
): ApplicationState {
  switch (action.type) {
    case "select-page":
    case "add-page":
    case "rename-current-page":
    case "duplicate-current-page":
    case "delete-current-page":
    case "move-page": {
      return pageReducer(state, action);
    }
  }
}
