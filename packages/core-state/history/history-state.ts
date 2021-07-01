import { Action } from "../action";
import { ApplicationState } from "../application";

export type HistoryEntry = {
  actionType: Action["type"];
  timestamp: number;
  state: ApplicationState;
};

export type HistoryState = {
  past: HistoryEntry[];
  present: ApplicationState;
  future: HistoryEntry[];
};
