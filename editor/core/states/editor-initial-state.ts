import { EditorSnapshot, EditorState } from "./editor-state";

export function createInitialEditorState(editor: EditorSnapshot): EditorState {
  return {
    pages: editor.pages,
    selectedPage: editor.selectedPage,
    selectedNodes: editor.selectedNodes,
    selectedNodesInitial: editor.selectedNodes,
    selectedLayersOnPreview: editor.selectedLayersOnPreview,
    design: editor.design,
    mode: { value: "design" },
    designerMode: "inspect",
    code: editor.code,
    canvasMode: editor.canvasMode,
    editorTaskQueue: editor.editorTaskQueue,
  };
}

export function createPendingEditorState(): EditorState {
  return {
    pages: [],
    selectedPage: null,
    selectedNodes: [],
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
    editorTaskQueue: {
      isBusy: true,
      tasks: [
        {
          id: "pending",
          name: "loading",
          progress: null,
        },
      ],
    },
  };
}
