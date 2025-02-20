import { EditorSnapshot } from "./editor-state";
import { WorkspaceState, WorkspaceStateSeed } from "./workspace-state";
import {
  createInitialHistoryState,
  createPendingHistoryState,
} from "./history-initial-state";

/**
 * this gets called when the editor snapshot is ready, returns the initial workspace state merged with editor snapshot's value.
 */
export function merge_initial_workspace_state_with_editor_snapshot(
  base: Partial<WorkspaceState> = {},
  snapshot: EditorSnapshot,
  seed?: WorkspaceStateSeed
): WorkspaceState {
  const { editor: seed_editor_state, ...seed_workspace } = seed ?? {};

  return {
    ...base,
    ...seed_workspace,
    taskQueue: base.taskQueue ?? {
      isBusy: false,
      tasks: [],
    },
    // below fields will be overwritten irrelevent to the existing base.
    history: createInitialHistoryState(snapshot, seed_editor_state),
  };
}

export function create_initial_pending_workspace_state(
  seed?: WorkspaceStateSeed
): WorkspaceState {
  const { editor: editor_seed, ...seed_workspace } = seed ?? {};

  return {
    ...seed_workspace,
    taskQueue: {
      isBusy: false,
      tasks: [],
    },
    history: createPendingHistoryState(editor_seed),
  };
}
