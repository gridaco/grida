import { EditorSnapshot, HistoryState } from "core/states";
import {
  createInitialEditorState,
  createPendingEditorState,
} from "./editor-initial-state";

export function createInitialHistoryState(
  editor: EditorSnapshot
): HistoryState {
  const applicationState = createInitialEditorState(editor);
  return {
    past: [],
    present: applicationState,
    future: [],
  };
}

export function createPendingHistoryState(): HistoryState {
  const applicationState = createPendingEditorState();
  return {
    past: [],
    present: applicationState,
    future: [],
  };
}
