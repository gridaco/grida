import { produce } from "immer";
import { BlocksEditorState } from "./state";
import {
  BlocksEditorAction,
  ChangeBlockFieldAction,
  CreateNewBlockAction,
} from "./action";

export function reducer(
  state: BlocksEditorState,
  action: BlocksEditorAction
): BlocksEditorState {
  switch (action.type) {
    case "blocks/new": {
      const { block } = <CreateNewBlockAction>action;
      return produce(state, (draft) => {
        draft.blocks.push({
          id: "[draft]",
          form_id: state.form_id,
          type: block,
          data: {},
        });
      });
    }
    case "blocks/field/change": {
      const { block_id, field_id } = <ChangeBlockFieldAction>action;
      return produce(state, (draft) => {
        const block = draft.blocks.find((b) => b.id === block_id);
        if (block) {
          block.form_field_id = field_id;
        }
      });
    }
    default:
      return state;
  }
}
