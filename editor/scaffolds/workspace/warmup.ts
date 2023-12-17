import {
  create_initial_pending_workspace_state,
  EditorSnapshot,
  WorkspaceState,
} from "core/states";
import {
  merge_initial_workspace_state_with_editor_snapshot,
  EssentialWorkspaceInfo,
} from "core/states";
import { workspaceWarmupReducer, workspaceReducer } from "core/reducers";
import { PendingState, PendingState_Pending } from "core/utility-types";
import { WorkspaceAction, WorkspaceWarmupAction } from "core/actions";

//
export type InitializationAction =
  | { type: "warmup"; value: WorkspaceWarmupAction }
  | { type: "setup-with-editor-snapshot"; value: EditorSnapshot }
  | { type: "update"; value: WorkspaceAction };

type TState = PendingState<WorkspaceState> & EssentialWorkspaceInfo;

export function initialReducer(
  state: TState,
  action: InitializationAction
): PendingState<WorkspaceState> {
  const initial_pending_workspace_state =
    create_initial_pending_workspace_state({});

  switch (action.type) {
    case "setup-with-editor-snapshot":
      return {
        type: "success",
        value: merge_initial_workspace_state_with_editor_snapshot(
          state.value as WorkspaceState,
          action.value
        ),
      };
    case "warmup": {
      switch (state.type) {
        case "success": {
          return {
            type: "success",
            value: workspaceWarmupReducer(
              state.value,
              action.value
            ) as WorkspaceState,
          };
        }
        case "pending": {
          return <PendingState_Pending<WorkspaceState>>{
            type: "pending",
            value: workspaceWarmupReducer(
              state.value ?? initial_pending_workspace_state,
              action.value
            ),
          };
        }
      }
    }
    case "update":
      if (state.type === "success") {
        return {
          type: "success",
          value: workspaceReducer(state.value, action.value),
        };
      } else {
        return state;
      }
  }
}

export function safestate(initialState: TState): WorkspaceState {
  const initial_pending_workspace_state =
    create_initial_pending_workspace_state({});

  switch (initialState.type) {
    case "success":
      return initialState.value;
    case "pending": {
      if (initialState.value) {
        return initialState.value as WorkspaceState;
      } else {
        return initial_pending_workspace_state;
      }
    }
    default:
      return initial_pending_workspace_state;
  }
}
