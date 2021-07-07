import { ApplicationSnapshot } from "../application";
import { createInitialHistoryState } from "../history";
import { WorkspaceState } from "./workspace-state";

export function createInitialWorkspaceState(
  app: ApplicationSnapshot
): WorkspaceState {
  return {
    history: createInitialHistoryState(app),
    preferences: {
      showRulers: false,
    },
  };
}
