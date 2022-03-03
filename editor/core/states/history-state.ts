import { Action } from "core/actions";
import { EditorState } from "core/states";

export type HistoryEntry = {
  actionType: Action["type"];
  timestamp: number;
  state: EditorState;
};

export type HistoryState = {
  past: HistoryEntry[];
  present: EditorState;
  future: HistoryEntry[];
};
