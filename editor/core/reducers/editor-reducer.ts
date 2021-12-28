import produce from "immer";
import { Action, SelectNodeAction, SelectPageAction } from "core/actions";
import { EditorState } from "core/states";

export function editorReducer(state: EditorState, action: Action): EditorState {
  // TODO: handle actions here.
  switch (action.type) {
    case "select-node": {
      const { node } = <SelectNodeAction>action;
      console.clear();
      console.info("cleard console by editorReducer#select-node");
      return produce(state, (draft) => {
        draft.selectedNodes = [node];
      });
    }
    case "select-page": {
      const { page } = <SelectPageAction>action;
      return produce(state, (draft) => {
        draft.selectedPage = page;
      });
    }
    default:
      throw new Error(`Unhandled action type: ${action["type"]}`);
  }

  return state;
}
