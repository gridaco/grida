import produce from "immer";
import { Action, SelectNodeAction } from "core/actions";
import { EditorState } from "core/states";

export function editorReducer(state: EditorState, action: Action): EditorState {
  // TODO: handle actions here.
  switch (action.type) {
    case "select-node": {
      const { node } = <SelectNodeAction>action;
      return produce(state, (draft) => {
        draft.selectedNodes = [node];
      });
    }
    case "select-page": {
      // return pageReducer(state, action);
    }
  }

  return state;
}
