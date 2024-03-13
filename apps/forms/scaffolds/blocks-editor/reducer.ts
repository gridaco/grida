import { produce } from "immer";
import { BlocksEditorState } from "./state";
import { BlocksEditorAction } from "./action";

export function reducer(
  state: BlocksEditorState,
  action: BlocksEditorAction
): BlocksEditorState {
  switch (action.type) {
    case "blocks/new":
      return produce(state, (draft) => {
        draft.blocks.push({
          type: "text",
          content: "",
        });
      });
    default:
      return state;
  }
}
