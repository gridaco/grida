import { createInitialApplicationState } from "../application";
import { HistoryState } from "./history-state";

export function createInitialHistoryState(): HistoryState {
  const applicationState = createInitialApplicationState();
  return {
    past: [],
    present: applicationState,
    future: [],
  };
}
