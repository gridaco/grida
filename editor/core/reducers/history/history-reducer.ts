import produce from "immer";
import { ActionType, HistoryAction } from "core/actions";
import { EditorState, HistoryEntry, HistoryState } from "core/states";
import { editorReducer } from "../editor-reducer";

export function historyReducer(state: HistoryState, action: HistoryAction) {
  const currentState = state.present;
  switch (action.type) {
    case "undo":
      if (state.past.length === 0) {
        return state;
      } else {
        return produce(state, (draft) => {
          const nextPresent = draft.past.pop();
          if (nextPresent) {
            draft.future.unshift(
              // @ts-ignore
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
              // @ts-ignore
              createHistoryEntry(nextPresent.actionType, currentState)
            );
            draft.present = nextPresent.state;
          }
        });
      }
    case "cut":
    case "paste": {
      // TODO:
      break;
    }
    default:
      const nextState = editorReducer(currentState, action);
      const mergableEntry = getMergableHistoryEntry(state, action[0]);

      return produce(state, (draft) => {
        const historyEntry = createHistoryEntry(action[0], {
          ...currentState,
        });

        if (mergableEntry) {
          draft.past[draft.past.length - 1] = {
            ...historyEntry,
            // @ts-ignore
            state: mergableEntry.state,
          };
        } else {
          draft.past.push(
            // @ts-ignore
            historyEntry
          );
        }
        draft.future = [];
        // @ts-ignore
        draft.present = nextState;
      });
  }
}

function createHistoryEntry(
  actionType: ActionType,
  state: EditorState
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
  actionType: ActionType
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
