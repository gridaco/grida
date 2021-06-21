import { Action } from "../action";
import { ApplicationState } from "../application";
import { pageReducer } from "../page";

export function applicationReducer(
  state: ApplicationState,
  action: Action
): ApplicationState {
  switch (action[0]) {
    case "selectPage":
    case "addPage":
    case "renamePage":
    case "duplicatePage":
    case "deletePage":
    case "movePage": {
      return pageReducer(state, action);
    }
  }
}
