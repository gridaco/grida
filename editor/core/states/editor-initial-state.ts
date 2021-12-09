import { EditorSnapshot, EditorState } from "./editor-state";

export function createInitialEditorState(app: EditorSnapshot): EditorState {
  return {
    selectedPage: app.selectedPage,
    selectedNodes: app.selectedNodes,
    design: app.design,
  };
}
