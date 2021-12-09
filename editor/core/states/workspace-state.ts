import { HistoryState } from "core/states/history-state";

export interface WorkspaceState {
  history: HistoryState;
  preferences: {
    // add preference here
  };
}
