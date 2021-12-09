import { Action } from "core/actions";
import { EditorState } from "core/states";

export function editorReducer(state: EditorState, action: Action): EditorState {
  // TODO: handle actions here.
  switch (action.type) {
    case "select-page": {
      // return pageReducer(state, action);
    }
  }

  return state;
}
