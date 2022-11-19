import { EditorSnapshot, EditorState } from "./editor-state";

export function createInitialEditorState(editor: EditorSnapshot): EditorState {
  return {
    pages: editor.pages,
    selectedPage: editor.selectedPage,
    selectedNodes: editor.selectedNodes,
    focus: {
      refreshkey: "initial",
      nodes: editor.selectedNodes,
    }, // auto focus to selection
    selectedNodesInitial: editor.selectedNodes,
    selectedLayersOnPreview: editor.selectedLayersOnPreview,
    design: editor.design,
    mode: { value: "design" },
    designerMode: "inspect",
    code: editor.code,
    canvasMode: editor.canvasMode,
  };
}

export function createPendingEditorState(): EditorState {
  return {
    pages: [],
    selectedPage: null,
    selectedNodes: [],
    focus: {
      refreshkey: "initial",
      nodes: [],
    },
    selectedNodesInitial: null,
    selectedLayersOnPreview: [],
    design: null,
    code: {
      files: {},
      loading: true,
    },
    mode: { value: "design" },
    canvasMode: { value: "free" },
    designerMode: "inspect",
  };
}
