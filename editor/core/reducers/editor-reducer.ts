import produce from "immer";
import type {
  Action,
  SelectNodeAction,
  SelectPageAction,
  CodeEditorEditComponentCodeAction,
  CanvasModeSwitchAction,
  CanvasModeGobackAction,
  PreviewBuildingStateUpdateAction,
  PreviewSetAction,
  DevtoolsConsoleAction,
  DevtoolsConsoleClearAction,
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

      const dest = state.canvasMode_previous ?? fallback;

      router.push({
        pathname: _editor_path_name,
        query: { ...router.query, mode: dest },
        // no need to set shallow here.
      });

      return produce(state, (draft) => {
        assert(
          dest,
          "canvas-mode-goback: cannot resolve destination. (no fallback provided)"
        );
        draft.canvasMode_previous = draft.canvasMode; // swap
        draft.canvasMode = dest; // previous or fallback
      });
    }
    case "preview-update-building-state": {
      const { isBuilding } = <PreviewBuildingStateUpdateAction>action;
      return produce(state, (draft) => {
        if (draft.currentPreview) {
          draft.currentPreview.isBuilding = isBuilding;
        } else {
          draft.currentPreview = {
            loader: null,
            viewtype: "unknown",
            isBuilding: true,
            widgetKey: null,
            componentName: null,
            fallbackSource: "loading",
            initialSize: null,
            meta: null,
            source: null,
            updatedAt: Date.now(),
          };
        }
      });
    }
    case "preview-set": {
      const { data } = <PreviewSetAction>action;
      return produce(state, (draft) => {
        draft.currentPreview = data; // set
      });
    }
    case "devtools-console": {
      const { log } = <DevtoolsConsoleAction>action;
      return produce(state, (draft) => {
        if (!draft.devtoolsConsole?.logs?.length) {
          draft.devtoolsConsole = { logs: [] };
        }

        const logs = Array.from(state.devtoolsConsole?.logs ?? []);
        logs.push(log);

        draft.devtoolsConsole.logs = logs;
      });
      break;
    }
    case "devtools-console-clear": {
      const {} = <DevtoolsConsoleClearAction>action;
      return produce(state, (draft) => {
        draft.devtoolsConsole = null;
      });
      break;
    }
    default:
      throw new Error(`Unhandled action type: ${action["type"]}`);
  }
  return state;
}
