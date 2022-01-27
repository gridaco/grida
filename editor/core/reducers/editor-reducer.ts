import produce from "immer";
import { Action, SelectNodeAction, SelectPageAction } from "core/actions";
import { EditorState } from "core/states";
import { useRouter } from "next/router";

export function editorReducer(state: EditorState, action: Action): EditorState {
  const router = useRouter();

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
        draft.selectedNodes = [node].filter(Boolean);
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
        draft.selectedPage = page;
        draft.selectedNodes = [];
      });
    }
    default:
      throw new Error(`Unhandled action type: ${action["type"]}`);
  }

  return state;
}
