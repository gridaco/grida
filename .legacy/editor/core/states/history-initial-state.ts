import { EditorSnapshot, HistoryState } from "core/states";
import {
  EditorStateSeed,
  createInitialEditorState,
  createPendingEditorState,
} from "./editor-initial-state";

export function createInitialHistoryState(
  editor: EditorSnapshot,
  seed?: EditorStateSeed
): HistoryState {
  const applicationState = createInitialEditorState(editor, seed);
  return {
    past: [],
    present: applicationState,
    future: [],
  };
}

export function createPendingHistoryState(
  seed?: EditorStateSeed
): HistoryState {
  const applicationState = createPendingEditorState(seed);
  return {
    past: [],
    present: applicationState,
    future: [],
  };
}
