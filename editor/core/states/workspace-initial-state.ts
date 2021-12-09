import { EditorSnapshot } from "./editor-state";
import { WorkspaceState } from "./workspace-state";
import { createInitialHistoryState } from "./history-initial-state";

export function createInitialWorkspaceState(
  editor: EditorSnapshot
): WorkspaceState {
  return {
    history: createInitialHistoryState(editor),
    preferences: {},
  };
}
