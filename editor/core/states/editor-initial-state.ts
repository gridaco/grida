import { EditorSnapshot, EditorState } from "./editor-state";

export function createInitialEditorState(editor: EditorSnapshot): EditorState {
  return {
    selectedPage: editor.selectedPage,
    selectedNodes: editor.selectedNodes,
    design: editor.design,
  };
}

export function createPendingEditorState(): EditorState {
  return {
    selectedPage: null,
    selectedNodes: [],
    design: null,
  };
}
