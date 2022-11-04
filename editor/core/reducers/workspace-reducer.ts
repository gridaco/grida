import { WorkspaceState } from "core/states";
import produce from "immer";
import { WorkspaceAction, WorkspaceWarmupAction } from "../actions";
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

/**
 * workspace reducer that is safe to use on pending state.
 * @param state
 * @param action
 * @returns
 */
export function workspaceWarmupReducer<T extends Partial<WorkspaceState>>(
  state: T,
  action: WorkspaceWarmupAction
): T {
  switch (action.type) {
    case "set-figma-auth": {
      return produce(state, (draft) => {
        draft.figmaAuthentication = action.authentication;
      });
    }
    case "set-figma-user": {
      return produce(state, (draft) => {
        draft.figmaUser = action.user;
      });
    }
  }
}
