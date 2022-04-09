import produce from "immer";
import type {
  Action,
  SelectNodeAction,
  SelectPageAction,
  CodeEditorEditComponentCodeAction,
  CanvasModeSwitchAction,
  CanvasModeGobackAction,
} from "core/actions";
import { EditorState } from "core/states";
import { useRouter } from "next/router";
import { CanvasStateStore } from "@code-editor/canvas/stores";
import assert from "assert";

const _editor_path_name = "/files/[key]/";

export function editorReducer(state: EditorState, action: Action): EditorState {
  const router = useRouter();
  const filekey = state.design.key;

  switch (action.type) {
    case "select-node": {
      const { node } = <SelectNodeAction>action;
      console.clear();
      console.info("cleard console by editorReducer#select-node");

      // update router
      router.push(
        {
          pathname: _editor_path_name,
          query: { ...router.query, node: node ?? state.selectedPage },
        },
        undefined,
        { shallow: true }
      );

      return produce(state, (draft) => {
        const _canvas_state_store = new CanvasStateStore(
          filekey,
          state.selectedPage
        );

        const new_selections = [node].filter(Boolean);
        _canvas_state_store.saveLastSelection(...new_selections);

        // assign new nodes set to the state.
        draft.selectedNodes = new_selections;

        // remove the initial selection after the first interaction.
        draft.selectedNodesInitial = null;
      });
    }
    case "select-page": {
      const { page } = <SelectPageAction>action;

      console.clear();
      console.info("cleard console by editorReducer#select-page");

      // update router
      router.push(
        {
          pathname: _editor_path_name,
          query: { ...router.query, node: page },
        },
        undefined,
        { shallow: true }
      );

      return produce(state, (draft) => {
        const _canvas_state_store = new CanvasStateStore(filekey, page);

        const last_known_selections_of_this_page =
          _canvas_state_store.getLastSelection() ?? [];
        console.log(
          "last_known_selections_of_this_page",
          last_known_selections_of_this_page
        );
        draft.selectedPage = page;
        draft.selectedNodes = last_known_selections_of_this_page;
      });
    }
    case "code-editor-edit-component-code": {
      const { ...rest } = <CodeEditorEditComponentCodeAction>action;
      return produce(state, (draft) => {
        draft.editingModule = {
          ...rest,
          type: "single-file-component",
          lang: "unknown",
        };
      });
      //
    }
    case "canvas-mode-switch": {
      const { mode } = <CanvasModeSwitchAction>action;

      router.push({
        pathname: _editor_path_name,
        query: { ...router.query, mode: mode },
        // no need to set shallow here.
      });

      return produce(state, (draft) => {
        draft.canvasMode_previous = draft.canvasMode;
        draft.canvasMode = mode;
      });
    }
    case "canvas-mode-goback": {
      const { fallback } = <CanvasModeGobackAction>action;
      return produce(state, (draft) => {
        const dest = draft.canvasMode_previous ?? fallback;
        assert(
          dest,
          "canvas-mode-goback: cannot resolve destination. (no fallback provided)"
        );
        draft.canvasMode_previous = draft.canvasMode; // swap
        draft.canvasMode = dest; // previous or fallback
      });
    }
    default:
      throw new Error(`Unhandled action type: ${action["type"]}`);
  }

  return state;
}
