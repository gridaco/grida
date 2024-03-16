import { produce } from "immer";
import { FormEditorState } from "./state";
import {
  BlocksEditorAction,
  ChangeBlockFieldAction,
  CreateNewBlockAction,
  DeleteBlockAction,
  OpenEditFieldAction,
  SortBlockAction,
} from "./action";
import { arrayMove } from "@dnd-kit/sortable";

export function reducer(
  state: FormEditorState,
  action: BlocksEditorAction
): FormEditorState {
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
    case "blocks/delete": {
      const { block_id } = <DeleteBlockAction>action;
      console.log("delete block", block_id);
      return produce(state, (draft) => {
        draft.blocks = draft.blocks.filter((block) => block.id !== block_id);
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
    case "editor/field/edit": {
      const { field_id, open, refresh } = <OpenEditFieldAction>action;
      return produce(state, (draft) => {
        draft.is_field_edit_panel_open = open ?? true;
        draft.editing_field_id = field_id;
        if (refresh) {
          draft.field_edit_panel_refresh_key =
            (draft.field_edit_panel_refresh_key ?? 0) + 1;
        }
      });
    }
    default:
      return state;
  }
}
