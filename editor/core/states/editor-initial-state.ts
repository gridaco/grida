import { EditorSnapshot, EditorState } from "./editor-state";

export function createInitialEditorState(editor: EditorSnapshot): EditorState {
  return {
    pages: editor.pages,
    selectedPage: editor.selectedPage,
    selectedNodes: editor.selectedNodes,
    canvas: {
      focus: {
        refreshkey: "initial",
        nodes: editor.selectedNodes,
      }, // auto focus to selection
    },
    isolation: editor.isolation,
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
    canvas: {
      focus: {
        refreshkey: "initial",
        nodes: [],
      },
    },
    isolation: {
      isolated: false,
      node: null,
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
