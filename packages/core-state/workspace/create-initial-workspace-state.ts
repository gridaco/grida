import { createInitialHistoryState } from "../history";
import { WorkspaceState } from "./workspace-state";

export function createInitialWorkspaceState(): WorkspaceState {
  return {
    history: createInitialHistoryState(),
    preferences: {
      showRulers: false,
    },
  };
}
