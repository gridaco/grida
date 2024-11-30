/*
import produce from "immer";
import type { BuilderAction } from "../action";
import type { IDocumentEditorState } from "../types";
import documentReducer from "./document.reducer";

type ActionType = BuilderAction["type"];

export type HistoryEntry = {
  actionType: ActionType;
  timestamp: number;
  state: IDocumentEditorState;
};

export type HistoryState = {
  past: HistoryEntry[];
  present: IDocumentEditorState;
  future: HistoryEntry[];
};

export type HistoryAction = { type: "undo" } | { type: "redo" } | BuilderAction;

export default function historyReducer(
  state: HistoryState,
  action: HistoryAction
): HistoryState {
  const current = state.present;
  switch (action.type) {
    case "undo":
      return state;
    case "redo":
      return state;
    default: {
      const next = documentReducer(current, action);
      const mergableEntry = getMergableHistorySnapshot(state, action.type);
      const entry = makeHistoryActionSnapshot(action.type, next);
      return produce(state, (draft) => {
        draft.future = [];
        draft.present = next;
        if (mergableEntry) {
          draft.past[draft.past.length - 1] = {
            ...entry,
            state: mergableEntry.state,
          };
        } else {
          draft.past.push(entry);
        }
      });
    }
  }
  //
}

function makeHistoryActionSnapshot(
  actionType: ActionType,
  state: IDocumentEditorState
): HistoryEntry {
  return {
    actionType,
    state,
    timestamp: Date.now(),
  };
}

const HISTORY_THROTTLE = 300;

function getMergableHistorySnapshot(
  state: HistoryState,
  actionType: ActionType
): HistoryEntry | undefined {
  if (state.past.length === 0) {
    return;
  }

  const newTimestamp = Date.now();
  const previousEntry = state.past[state.past.length - 1];

  if (
    actionType !== previousEntry.actionType ||
    newTimestamp - previousEntry.timestamp > HISTORY_THROTTLE
  ) {
    return;
  }

  return previousEntry;
}
*/
