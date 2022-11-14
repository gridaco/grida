import { EditorSnapshot } from "./editor-state";
import { WorkspaceState } from "./workspace-state";
import {
  createInitialHistoryState,
  createPendingHistoryState,
} from "./history-initial-state";

/**
 * this gets called when the editor snapshot is ready, returns the initial workspace state merged with editor snapshot's value.
 */
export function merge_initial_workspace_state_with_editor_snapshot(
  base: Partial<WorkspaceState>,
  snapshot: EditorSnapshot
): WorkspaceState {
  return {
    ...base,
    // below fields will be overwritten irrelevent to the existing base.
    history: createInitialHistoryState(snapshot),
  };
}

export function create_initial_pending_workspace_state(): WorkspaceState {
  return {
    history: createPendingHistoryState(),
  };
}
