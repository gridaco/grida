import { WorkspaceState } from "core/states";
import produce from "immer";
import { WorkspaceAction } from "../actions";
import { historyReducer } from "./history";

export function workspaceReducer(
  state: WorkspaceState,
  action: WorkspaceAction
): WorkspaceState {
  switch (action.type) {
    case "highlight-node": {
      return produce(state, (draft) => {
        draft.highlightedLayer = action.id;
      });
    }
    // default fallback - use history reducer
    case "redo":
    case "undo":
    case "select-node":
    case "select-page":
    default: {
      return produce(state, (draft) => {
        // @ts-ignore
        draft.history = historyReducer(state.history, action);
      });
    }
  }
}
