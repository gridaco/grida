import { WorkspaceState } from "core/states";
import produce from "immer";
import {
  BackgroundTaskPopAction,
  BackgroundTaskPushAction,
  BackgroundTaskUpdateProgressAction,
  SetDebugModeAction,
  WorkspaceAction,
  WorkspaceWarmupAction,
} from "../actions";
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
    // todo: move to workspace state
    case "tasks/push": {
      const { task } = <BackgroundTaskPushAction>action;
      const { id } = task;

      return produce(state, (draft) => {
        // todo:
        // 1. handle debounce.

        // check id duplication
        const exists = draft.taskQueue.tasks.find((t) => t.id === id);
        if (exists) {
          // pass
        } else {
          if (!task.createdAt) {
            task.createdAt = new Date();
          }
          draft.taskQueue.tasks.push(task);
          draft.taskQueue.isBusy = true;
        }
      });
      break;
    }

    // todo: move to workspace state
    case "tasks/pop": {
      const { task } = <BackgroundTaskPopAction>action;
      const { id } = task;

      return produce(state, (draft) => {
        draft.taskQueue.tasks = draft.taskQueue.tasks.filter(
          (i) => i.id !== id
        );

        if (draft.taskQueue.tasks.length === 0) {
          draft.taskQueue.isBusy = false;
        }
      });
      break;
    }

    case "tasks/update-progress": {
      const { id, progress } = <BackgroundTaskUpdateProgressAction>action;
      return produce(state, (draft) => {
        draft.taskQueue.tasks.find((i) => i.id !== id).progress = progress;
      });
    }

    case "debug-mode/enable": {
      const { enabled } = <SetDebugModeAction>action;
      return produce(state, (draft) => {
        draft.debugMode = enabled;
      });
    }

    // default fallback - use history reducer
    case "redo":
    case "undo":
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
