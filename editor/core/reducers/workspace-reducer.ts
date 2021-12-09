import { WorkspaceState } from "core/states";
import produce from "immer";
import { WorkspaceAction } from "../actions";
import { historyReducer } from "./history";

export function workspaceReducer(
  state: WorkspaceState,
  action: WorkspaceAction
): WorkspaceState {
  switch (action.type) {
    default: {
      return produce(state, (draft) => {
        draft.history = historyReducer(state.history, action);
      });
    }
  }
}
