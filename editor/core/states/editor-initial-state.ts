import { EditorSnapshot, EditorState } from "./editor-state";

export type EditorStateSeed = Partial<{
  mode: EditorState["mode"]["value"];
  canvasMode: EditorState["canvasMode"]["value"];
}>;

function map_seed(seed?: EditorStateSeed): Partial<EditorState> {
  if (!seed) {
    return {};
  }

  // the field should not ne set unless the corresponding value is set.
  const mode: EditorState["mode"] = seed.mode
    ? { value: seed.mode }
    : undefined;

  const canvasMode: EditorState["canvasMode"] = seed.canvasMode
    ? { value: seed.canvasMode }
    : undefined;

  const partial: Partial<EditorState> = {
    mode: mode,
    canvasMode: canvasMode,
  };

  // remove undefined fields
  Object.keys(partial).forEach((key) => {
    if (partial[key] === undefined) {
      delete partial[key];
    }
  });

  return partial;
}

export function createInitialEditorState(
  snapshot: EditorSnapshot,
  seed?: EditorStateSeed
): EditorState {
  return {
    pages: snapshot.pages,
    selectedPage: snapshot.selectedPage,
    selectedNodes: snapshot.selectedNodes,
    canvas: {
      focus: {
        refreshkey: "initial",
        nodes: snapshot.selectedNodes,
      }, // auto focus to selection
    },
    isolation: snapshot.isolation,
    selectedNodesInitial: snapshot.selectedNodes,
    selectedLayersOnPreview: snapshot.selectedLayersOnPreview,
    design: snapshot.design,
    mode: { value: "design" },
    designerMode: "inspect",
    code: snapshot.code,
    canvasMode: snapshot.canvasMode,
    craft: snapshot.craft,
    ...map_seed(seed),
  };
}

export function createPendingEditorState(seed?: EditorStateSeed): EditorState {
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
    craft: {
      children: [],
    },
    ...map_seed(seed),
  };
}
