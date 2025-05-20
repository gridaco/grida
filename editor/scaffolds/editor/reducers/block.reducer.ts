import { produce, type Draft } from "immer";
import type { EditorFlatFormBlock, EditorState } from "../state";
import type {
  FormsBlockAction,
  FormsBlockBlockDescriptionAction,
  FormsBlockBlockTitleAction,
  FormsBlockBlockVHiddenAction,
  FormsBlockChangeBlockFieldAction,
  FormsBlockCreateFielFromBlockdAction,
  FormsBlockCreateNewPendingBlockAction,
  FormsBlockDeleteBlockAction,
  FormsBlockFocusBlockAction,
  FormsBlockHtmlBlockBodyAction,
  FormsBlockImageBlockSrcAction,
  FormsBlockResolvePendingBlockAction,
  FormsBlockSortBlockAction,
  FormsBlockVideoBlockSrcAction,
} from "../action";
import { HTML_BLOCK_BODY_HTML_DEFAULT_VALUE } from "@/k/html_block_defaults";
import { VIDEO_BLOCK_SRC_DEFAULT_VALUE } from "@/k/video_block_defaults";
import { IMAGE_BLOCK_SRC_DEFAULT_VALUE } from "@/k/image_block_defaults";
import { PDF_BLOCK_SRC_DEFAULT_VALUE } from "@/k/pdf_block_defaults";
import { arrayMove } from "@dnd-kit/sortable";
import { blockstreeflat } from "@/lib/forms/tree";
import { draftid } from "@/utils/id";
import type { FormBlockType, FormInputType } from "@/grida-forms/hosted/types";

export default function blockReducer(
  state: EditorState,
  action: FormsBlockAction
): EditorState {
  switch (action.type) {
    case "blocks/new": {
      // TODO: if adding new section, if there is a present non-section-blocks on root, it should automatically be nested under new section.
      const { block, index } = <FormsBlockCreateNewPendingBlockAction>action;

      const old_index = state.blocks.length;
      const focus_block_index = state.blocks.findIndex(
        (block) => block.id === state.focus_block_id
      );
      const focus_index =
        focus_block_index >= 0 ? focus_block_index + 1 : old_index;

      // Use provided index if available, otherwise use focus_index
      const insert_index = index !== undefined ? index : focus_index;

      // Get the parent section of the focus block
      const focus_block = state.blocks[focus_block_index];
      let parent_id = focus_block?.parent_id ?? null;

      if (block === "section") {
        parent_id = null; // Sections are always at root level
      } else {
        if (!parent_id) {
          // Find the last parent section if no focus block or parent_id is null
          const parent_section = state.blocks
            .filter((block) => block.type === "section")
            .sort((a, b) => b.local_index - a.local_index)[0];
          parent_id = parent_section?.id ?? null;
        }
      }

      const id = draftid();

      const __shared: EditorFlatFormBlock = {
        id,
        created_at: new Date().toISOString(),
        form_id: state.form.form_id,
        form_page_id: state.document_id,
        parent_id: block === "section" ? null : parent_id,
        type: block,
        local_index: insert_index,
        data: {},
      };

      let init: EditorFlatFormBlock = init_block(__shared, block);

      switch (block) {
        case "section": {
          return produce(state, (draft) => {
            const id = __shared.id;

            // section can be placed on root only.
            // if there were no section on root, the existing blocks should be nested under the new section.
            const section_blocks = draft.blocks.filter(
              (block) => block.type === "section" && block.parent_id === null
            );

            if (section_blocks.length === 0) {
              draft.blocks.forEach((block) => {
                block.parent_id = id;
              });
            }

            // Insert the new section at the specified index
            draft.blocks.splice(insert_index, 0, {
              ...__shared,
            });

            // Recalculate local_index for all blocks
            draft.blocks = draft.blocks.map((block, index) => ({
              ...block,
              local_index: index,
            }));
          });
        }
        case "field": {
          let init: { type: FormInputType } | null = null;
          if ("init" in action) {
            init = action.init;
          }

          return produce(state, (draft) => {
            const {
              form: { available_field_ids },
            } = state;

            let field_id: string | null = null;

            if (init) {
              // if init provided, always create new.
              draft.field_editor.data = { draft: init };
            } else {
              draft.field_editor.data = { draft: null };
              // find unused field id (if any)
              field_id = available_field_ids[0] ?? null;
              if (field_id) {
                // remove the field id from available_field_ids
                draft.form.available_field_ids = available_field_ids.filter(
                  (id) => id !== field_id
                );
              }
            }

            draft.blocks.push({
              ...__shared,
              form_field_id: field_id,
            });

            // move ==
            draft.blocks = arrayMove(draft.blocks, old_index, insert_index).map(
              (block, index) => ({
                ...block,
                local_index: index,
              })
            );
            // ========

            // update focus block id
            draft.focus_block_id = id;

            if (!field_id) {
              // if no available field, but field block provided, open a field editor panel
              draft.field_editor.id = undefined;
              draft.field_editor.open = true;
              //
            }
          });
        }
        case "html":
        case "image":
        case "video":
        case "pdf":
        case "divider":
        case "header": {
          return produce(state, (draft) => {
            draft.blocks.push(init);

            // update focus block id
            draft.focus_block_id = id;

            // move ==
            draft.blocks = arrayMove(draft.blocks, old_index, insert_index).map(
              (block, index) => ({
                ...block,
                local_index: index,
              })
            );
            // ========
          });
        }
        default: {
          throw new Error("Unsupported block type : " + block);
        }
      }
    }
    case "blocks/field/new": {
      const { block_id } = <FormsBlockCreateFielFromBlockdAction>action;
      // trigger new field from empty field block
      return produce(state, (draft) => {
        // update focus block id
        draft.focus_block_id = block_id;
        // open a field editor panel
        draft.field_editor.open = true;
        draft.field_editor.id = undefined;
        draft.field_editor.data = {
          draft: null,
        };
      });
    }
    case "blocks/resolve": {
      const { block_id, block } = <FormsBlockResolvePendingBlockAction>action;

      const old_id = block_id;
      const new_id = block.id;

      return produce(state, (draft) => {
        const index = draft.blocks.findIndex((b) => b.id === block_id);
        if (index !== -1) {
          // update the whole block with the resolved block
          draft.blocks[index] = block;
        }

        // update focus block id if updated
        if ((draft.focus_block_id = old_id)) {
          draft.focus_block_id = new_id;
        }

        // when resolved, the id is updated to the real id.
        // other references to previous id should be updated as well.
        // currently we have only parent_id to update.
        draft.blocks.forEach((b) => {
          if (b.parent_id === old_id) {
            b.parent_id = new_id;
          }
        });
      });
    }
    case "blocks/delete": {
      const { block_id } = <FormsBlockDeleteBlockAction>action;
      console.log("delete block", block_id);
      return produce(state, (draft) => {
        // remove the field id from available_field_ids
        draft.blocks = draft.blocks.filter((block) => block.id !== block_id);

        // find the field_id of the deleted block
        const field_id = state.blocks.find(
          (b) => b.id === block_id
        )?.form_field_id;
        // add the field_id to available_field_ids
        if (field_id) {
          draft.form.available_field_ids.push(field_id);
        }
      });
    }
    case "blocks/hidden": {
      const { block_id, v_hidden } = <FormsBlockBlockVHiddenAction>action;
      return produce(state, (draft) => {
        const block = draft.blocks.find((b) => b.id === block_id);
        if (block) {
          block.v_hidden = v_hidden;
        }
      });
    }
    case "blocks/title": {
      const { block_id, title_html } = <FormsBlockBlockTitleAction>action;
      return produce(state, (draft) => {
        const block = draft.blocks.find((b) => b.id === block_id);
        if (block) {
          block.title_html = title_html;
        }
      });
    }
    case "blocks/description": {
      const { block_id, description_html } = <FormsBlockBlockDescriptionAction>(
        action
      );
      return produce(state, (draft) => {
        const block = draft.blocks.find((b) => b.id === block_id);
        if (block) {
          block.description_html = description_html;
        }
      });
    }
    case "blocks/field/change": {
      const { block_id, field_id } = <FormsBlockChangeBlockFieldAction>action;
      return produce(state, (draft) => {
        const block = draft.blocks.find((b) => b.id === block_id);
        if (block) {
          const previous_field_id = block.form_field_id;
          block.form_field_id = field_id;

          // update the available_field_ids
          draft.form.available_field_ids = [
            ...draft.form.available_field_ids.filter((id) => id !== field_id),
            previous_field_id,
          ].filter(Boolean) as string[];
        }
      });
    }
    case "blocks/html/body": {
      const { block_id, html } = <FormsBlockHtmlBlockBodyAction>action;
      return produce(state, (draft) => {
        const block = draft.blocks.find((b) => b.id === block_id);
        console.log("html block body", block_id, html);
        if (block && block.type === "html") {
          block.body_html = html;
        }
      });
    }
    case "blocks/image/src": {
      const { block_id, src } = <FormsBlockImageBlockSrcAction>action;
      return produce(state, (draft) => {
        const block = draft.blocks.find((b) => b.id === block_id);
        if (block && block.type === "image") {
          block.src = src;
        }
      });
    }
    case "blocks/video/src": {
      const { block_id, src } = <FormsBlockVideoBlockSrcAction>action;
      return produce(state, (draft) => {
        const block = draft.blocks.find((b) => b.id === block_id);
        if (block && block.type === "video") {
          block.src = src;
        }
      });
    }
    case "blocks/sort": {
      const { block_id, over_id } = <FormsBlockSortBlockAction>action;
      return produce(state, (draft) => {
        if (over_id === "root") {
          const blockIndex = draft.blocks.findIndex(
            (block) => block.id === block_id
          );
          if (blockIndex > -1) {
            // DO NOT ALLOW THIS ACTION. this is not hanlded yet. (item exiting section)
            // Assign to root if moved above the first section
            // draft.blocks[blockIndex].parent_id = null;
          }
          return;
        }

        const oldIndex = draft.blocks.findIndex(
          (block) => block.id === block_id
        );
        const newIndex = draft.blocks.findIndex(
          (block) => block.id === over_id
        );

        // Ensure arrayMove returns a new array with objects that can be mutated
        let movedBlocks = arrayMove(draft.blocks, oldIndex, newIndex);

        // Re-assign draft.blocks to ensure the objects are treated as new if necessary
        draft.blocks = movedBlocks.map((block, index) => ({
          ...block,
          local_index: index,
        }));

        // Update parent_id based on the new position
        const movedBlock = draft.blocks.find((block) => block.id === block_id);
        if (movedBlock) {
          // Find the nearest section/group above the moved block
          let newParentId: string | null = null;
          for (let i = newIndex - 1; i >= 0; i--) {
            if (["section", "group"].includes(draft.blocks[i].type)) {
              newParentId = draft.blocks[i].id;
              break;
            }
          }

          if (!newParentId) {
            // DO NOT ALLOW PARENT ID TO BE NULL IF THERE IS A SECTION PRESENT.
            const section = draft.blocks.find(
              (block) => block.type === "section"
            );
            if (section) {
              // BLOCK THIS ACTION
              // revert the move
              draft.blocks = arrayMove(draft.blocks, newIndex, oldIndex);
              return;
            }
          }
          movedBlock.parent_id = newParentId;
        }
      });
    }
    case "blocks/focus": {
      const { block_id } = <FormsBlockFocusBlockAction>action;
      return produce(state, (draft) => {
        draft.focus_block_id = block_id;
      });
    }
    case "blocks/blur": {
      return produce(state, (draft) => {
        draft.focus_block_id = null;
      });
    }
  }
  return state;
}

function init_block(
  base: EditorFlatFormBlock,
  type: FormBlockType
): EditorFlatFormBlock {
  switch (type) {
    case "html":
      return {
        ...base,
        body_html: HTML_BLOCK_BODY_HTML_DEFAULT_VALUE,
      };
    case "image":
      return {
        ...base,
        src: IMAGE_BLOCK_SRC_DEFAULT_VALUE,
      };
    case "video":
      return {
        ...base,
        src: VIDEO_BLOCK_SRC_DEFAULT_VALUE,
      };
    case "pdf":
      return {
        ...base,
        src: PDF_BLOCK_SRC_DEFAULT_VALUE,
      };
    case "header":
      return {
        ...base,
        title_html: "Header",
        description_html: "Description",
      };
    case "divider":
    default:
      return base;
  }
}
