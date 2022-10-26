import { EditorSnapshot, EditorState } from "./editor-state";

export function createInitialEditorState(editor: EditorSnapshot): EditorState {
  return {
    selectedPage: editor.selectedPage,
    selectedNodes: editor.selectedNodes,
    selectedNodesInitial: editor.selectedNodes,
    selectedLayersOnPreview: editor.selectedLayersOnPreview,
    design: editor.design,
    mode: "view",
    canvasMode: editor.canvasMode,
    editorTaskQueue: editor.editorTaskQueue,
  };
}

export function createPendingEditorState(): EditorState {
  return {
    selectedPage: null,
    selectedNodes: [],
    selectedNodesInitial: null,
    selectedLayersOnPreview: [],
    design: null,
    mode: "view",
    canvasMode: "free",
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
