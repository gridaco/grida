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
  FormsBlockMoveUpAction,
  FormsBlockMoveDownAction,
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
import { draftid } from "@/utils/id";
import type { FormBlockType, FormInputType } from "@/grida-forms-hosted/types";
import { depth1, flat, type FlatItem } from "@/lib/flat2tree";

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

      const section_blocks = state.blocks.filter(
        (block) => block.type === "section" && block.parent_id === null
      );

      // Get the parent section of the focus block
      const focus_block = state.blocks[focus_block_index];

      const can_have_parent = block !== "section";

      const parent_id: string | null = can_have_parent
        ? (focus_block?.parent_id ??
          // Find the last parent section if no focus block or parent_id is null
          section_blocks.sort((a, b) => b.local_index - a.local_index)[0]?.id ??
          null)
        : null;

      // Use provided index if available, otherwise use focus_index
      let insert_index: number = index !== undefined ? index : focus_index;
      // if there were no section on root, the existing blocks should be nested under the new section.
      if (block === "section" && section_blocks.length === 0) {
        insert_index = 0;
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

      const init: EditorFlatFormBlock = init_block(__shared, block);

      return produce(state, (draft) => {
        switch (block) {
          case "field": {
            let init: { type: FormInputType } | null = null;
            if ("init" in action) {
              init = action.init;
            }

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

            if (!field_id) {
              // if no available field, but field block provided, open a field editor panel
              draft.field_editor.id = undefined;
              draft.field_editor.open = true;
              //
            }

            draft.blocks.push({
              ...__shared,
              form_field_id: field_id,
            });

            break;
          }
          case "section":
          case "html":
          case "image":
          case "video":
          case "pdf":
          case "divider":
          case "header": {
            draft.blocks.push(init);
            break;
          }
          default: {
            throw new Error("Unsupported block type : " + block);
          }
        }

        // move ==
        self_sort(draft, [old_index, insert_index]);
        // ========

        // update focus block id
        draft.focus_block_id = id;
      });
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

        self_sort(draft, [oldIndex, newIndex]);
      });
    }
    case "blocks/move/up": {
      const { block_id } = <FormsBlockMoveUpAction>action;
      return produce(state, (draft) => {
        const index = draft.blocks.findIndex((b) => b.id === block_id);
        if (index > 0) {
          self_sort(draft, [index, index - 1]);
        }
      });
    }
    case "blocks/move/down": {
      const { block_id } = <FormsBlockMoveDownAction>action;
      return produce(state, (draft) => {
        const index = draft.blocks.findIndex((b) => b.id === block_id);
        if (index !== -1 && index < draft.blocks.length - 1) {
          self_sort(draft, [index, index + 1]);
        }
      });
    }
    case "blocks/delete": {
      const { block_id } = <FormsBlockDeleteBlockAction>action;
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

        self_sort(draft);
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

function self_sort(draft: Draft<EditorState>, t?: [number, number]) {
  let blocks = draft.blocks;
  if (t) {
    // Ensure arrayMove returns a new array with objects that can be mutated
    blocks = arrayMove(draft.blocks, t[0], t[1]);
  }

  const tree = depth1(
    blocks.reduce((acc, block) => {
      acc.push({
        id: block.id,
        isFolder: block.type === "section" || block.type === "group",
      });
      return acc;
    }, [] as FlatItem[])
  );

  const sorted = flat(tree).map(({ id, parent_id }, index) => {
    const prev = blocks.find((b) => b.id === id)!;
    return {
      ...prev,
      local_index: index,
      parent_id: parent_id ?? null,
    } satisfies EditorFlatFormBlock;
  });

  draft.blocks = sorted;
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
