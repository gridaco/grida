import produce from "immer";
import { Action, HistoryAction } from "../action";
import { ApplicationState, applicationReducer } from "../application";
import { HistoryState, HistoryEntry } from "./history-state";

export function historyReducer(state: HistoryState, action: HistoryAction) {
  const currentState = state.present;
  switch (action[0]) {
    case "undo":
      if (state.past.length === 0) {
        return state;
      } else {
        return produce(state, (draft) => {
          const nextPresent = draft.past.pop();
          if (nextPresent) {
            draft.future.unshift(
              createHistoryEntry(nextPresent.actionType, currentState)
            );
            draft.present = nextPresent.state;
          }
        });
      }
    case "redo":
      if (state.future.length === 0) {
        return state;
      } else {
        return produce(state, (draft) => {
          const nextPresent = draft.future.shift();
          if (nextPresent) {
            draft.past.push(
              createHistoryEntry(nextPresent.actionType, currentState)
            );
            draft.present = nextPresent.state;
          }
        });
      }
    default:
      const nextState = applicationReducer(currentState, action);
      const mergableEntry = getMergableHistoryEntry(state, action[0]);

      return produce(state, (draft) => {
        const historyEntry = createHistoryEntry(action[0], {
          ...currentState,
        });

        if (mergableEntry) {
          draft.past[draft.past.length - 1] = {
            ...historyEntry,
            state: mergableEntry.state,
          };
        } else {
          draft.past.push(historyEntry);
        }
        draft.future = [];
        draft.present = nextState;
      });
  }
}

function createHistoryEntry(
  actionType: Action[0],
  state: ApplicationState
): HistoryEntry {
  return {
    actionType,
    state,
    timestamp: Date.now(),
  };
}

const CHANGE_DIFF_DURATION_MS = 300;

function getMergableHistoryEntry(
  state: HistoryState,
  actionType: Action[0]
): HistoryEntry | undefined {
  if (state.past.length === 0) {
    return;
  }

  const newTimestamp = Date.now();
  const previousEntry = state.past[state.past.length - 1];

  if (
    actionType !== previousEntry.actionType ||
    newTimestamp - previousEntry.timestamp > CHANGE_DIFF_DURATION_MS
  ) {
    return;
  }

  return previousEntry;
}
