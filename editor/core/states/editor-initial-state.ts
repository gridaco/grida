import { EditorSnapshot, EditorState } from "./editor-state";

export function createInitialEditorState(editor: EditorSnapshot): EditorState {
  return {
    selectedPage: editor.selectedPage,
    selectedNodes: editor.selectedNodes,
    selectedNodesInitial: editor.selectedNodes,
    selectedLayersOnPreview: editor.selectedLayersOnPreview,
    design: editor.design,
    canvasMode: editor.canvasMode,
  };
}

export function createPendingEditorState(): EditorState {
  return {
    selectedPage: null,
    selectedNodes: [],
    selectedNodesInitial: null,
    selectedLayersOnPreview: [],
    design: null,
    canvasMode: "free",
  };
}
