import produce from "immer";
import type {
  Action,
  SelectNodeAction,
  SelectPageAction,
  CodeEditorEditComponentCodeAction,
  CanvasModeSwitchAction,
  CanvasModeGobackAction,
  TranslateNodeAction,
  PreviewBuildingStateUpdateAction,
  PreviewSetAction,
} from "core/actions";
import { EditorState } from "core/states";
import { useRouter } from "next/router";
import { CanvasStateStore } from "@code-editor/canvas/stores";
import assert from "assert";
import { find_node_by_id_under_inpage_nodes } from "@design-sdk/core/utils/query";

const _editor_path_name = "/files/[key]/";

export function editorReducer(state: EditorState, action: Action): EditorState {
  const router = useRouter();
  const filekey = state.design.key;

  switch (action.type) {
    case "select-node": {
      const { node } = <SelectNodeAction>action;
      const ids = Array.isArray(node) ? node : [node];

      const current_node = state.selectedNodes;

      if (ids.length > 1 && ids.length === current_node.length) {
        // the selection event is always triggered by user, which means selecting same amount of nodes (greater thatn 1, and having a different node array is impossible.)
        return produce(state, (draft) => {});
      }

      console.clear();
      console.info("cleard console by editorReducer#select-node");

      const primary = ids?.[0];

      // update router
      router.push(
        {
          pathname: _editor_path_name,
          query: { ...router.query, node: primary ?? state.selectedPage },
        },
        undefined,
        { shallow: true }
      );

      return produce(state, (draft) => {
        const _canvas_state_store = new CanvasStateStore(
          filekey,
          state.selectedPage
        );

        const new_selections = ids.filter(Boolean);
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
    case "node-transform-translate": {
      const { translate, node } = <TranslateNodeAction>action;

      return produce(state, (draft) => {
        const page = draft.design.pages.find(
          (p) => p.id === state.selectedPage
        );

        node
          .map((n) => find_node_by_id_under_inpage_nodes(n, page.children))
          .map((n) => {
            n.x += translate[0];
            n.y += translate[1];
          });
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
    default:
      throw new Error(`Unhandled action type: ${action["type"]}`);
  }
  return state;
}
