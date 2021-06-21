import produce from "immer";
import { WorkspaceState } from "./workspace-state";
import { WorkspaceAction } from "../action";
import { createInitialHistoryState, historyReducer } from "../history";

export function workspaceReducer(
  state: WorkspaceState,
  action: WorkspaceAction
): WorkspaceState {
  switch (action.type) {
    case "newFile": {
      return produce(state, (draft) => {
        draft.history = createInitialHistoryState();
      });
    }

    default: {
      return produce(state, (draft) => {
        draft.history = historyReducer(state.history, action);
      });
    }
  }
}
