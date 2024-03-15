import { produce } from "immer";
import { BlocksEditorState } from "./state";
import {
  BlocksEditorAction,
  ChangeBlockFieldAction,
  CreateNewBlockAction,
  SortBlockAction,
} from "./action";
import { arrayMove } from "@dnd-kit/sortable";

export function reducer(
  state: BlocksEditorState,
  action: BlocksEditorAction
): BlocksEditorState {
  switch (action.type) {
    case "blocks/new": {
      // TODO: if adding new section, if there is a present non-section-blocks on root, it should automatically be nested under new section.
      const { block } = <CreateNewBlockAction>action;
      return produce(state, (draft) => {
        draft.blocks.push({
          id: "[draft]" + Math.random().toString(36).substring(7),
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
    case "blocks/sort": {
      const { block_id, over_id } = <SortBlockAction>action;
      return produce(state, (draft) => {
        if (over_id === "root") {
          return;
        }

        const oldIndex = state.blocks.findIndex(
          (block) => block.id === block_id
        );
        const newIndex = state.blocks.findIndex(
          (block) => block.id === over_id
        );

        draft.blocks = arrayMove(state.blocks, oldIndex, newIndex);
      });
    }
    default:
      return state;
  }
}
