import produce from "immer";
import { Action, SelectNodeAction, SelectPageAction } from "core/actions";
import { EditorState } from "core/states";
import { useRouter } from "next/router";
import { CanvasStateStore } from "@code-editor/canvas/stores";

export function editorReducer(state: EditorState, action: Action): EditorState {
  const router = useRouter();
  const filekey = state.design.key;

  // TODO: handle actions here.
  switch (action.type) {
    case "select-node": {
      const { node } = <SelectNodeAction>action;
      console.clear();
      console.info("cleard console by editorReducer#select-node");

      // update router
      router.query.node = node ?? state.selectedPage;
      router.push(router);

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
      router.query.node = page;
      router.push(router);

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
    default:
      throw new Error(`Unhandled action type: ${action["type"]}`);
  }

  return state;
}
