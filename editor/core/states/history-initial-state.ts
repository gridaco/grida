import { EditorSnapshot, HistoryState } from "core/states";
import { createInitialEditorState } from "./editor-initial-state";

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
