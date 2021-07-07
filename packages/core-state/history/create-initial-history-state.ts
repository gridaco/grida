import {
  ApplicationSnapshot,
  createInitialApplicationState,
} from "../application";
import { HistoryState } from "./history-state";

export function createInitialHistoryState(
  app: ApplicationSnapshot
): HistoryState {
  const applicationState = createInitialApplicationState(app);
  return {
    past: [],
    present: applicationState,
    future: [],
  };
}
