import { produce } from "immer";
import { EditorFlatFormBlock, FormEditorState } from "./state";
import type {
  BlockDescriptionAction,
  BlockTitleAction,
  BlockVHiddenAction,
  BlocksEditorAction,
  ChangeBlockFieldAction,
  CreateFielFromBlockdAction,
  CreateNewPendingBlockAction,
  DataGridReorderColumnAction,
  DeleteBlockAction,
  DeleteFieldAction,
  DeleteResponseAction,
  DataGridDeleteSelectedRows,
  FeedResponseAction,
  FocusBlockAction,
  FocusFieldAction,
  HtmlBlockBodyAction,
  ImageBlockSrcAction,
  OpenBlockEditPanelAction,
  OpenCustomerEditAction,
  OpenEditFieldAction,
  OpenResponseEditAction,
  ResolvePendingBlockAction,
  DataGridRowsAction,
  SaveFieldAction,
  SelectResponse,
  DataGridTableAction,
  SortBlockAction,
  VideoBlockSrcAction,
  FeedResponseSessionsAction,
  DataGridDateFormatAction,
  DataGridDateTZAction,
  DataGridFilterAction,
  DataGridCellChangeAction,
  FeedXSupabaseMainTableRowsAction,
  DataTableRefreshAction,
  DataTableLoadingAction,
  EditorThemePaletteAction,
  EditorThemeFontFamilyAction,
  EditorThemeBackgroundAction,
  EditorThemeSectionStyleAction,
  EditorThemeCustomCSSAction,
  DocumentSelectPageAction,
  DocumentSelectNodeAction,
  DocumentNodeChangeTemplateAction,
  DocumentNodeUpdateStyleAction,
  DocumentNodeUpdateAttributeAction,
  DocumentNodeUpdatePropertyAction,
  DocumentNodeChangeTextAction,
  DocumentTemplateSampleDataAction,
} from "./action";
import { arrayMove } from "@dnd-kit/sortable";
import { blockstreeflat } from "@/lib/forms/tree";
import { HTML_BLOCK_BODY_HTML_DEFAULT_VALUE } from "@/k/html_block_defaults";
import { VIDEO_BLOCK_SRC_DEFAULT_VALUE } from "@/k/video_block_defaults";
import { IMAGE_BLOCK_SRC_DEFAULT_VALUE } from "@/k/image_block_defaults";
import { PDF_BLOCK_SRC_DEFAULT_VALUE } from "@/k/pdf_block_defaults";
import { draftid } from "@/utils/id";
import type { FormBlockType, FormInputType, GridaSupabase } from "@/types";
import { FlatPostgREST } from "@/lib/supabase-postgrest/flat";

export function reducer(
  state: FormEditorState,
  action: BlocksEditorAction
): FormEditorState {
  switch (action.type) {
    case "blocks/new": {
      // TODO: if adding new section, if there is a present non-section-blocks on root, it should automatically be nested under new section.
      const { block } = <CreateNewPendingBlockAction>action;

      const old_index = state.blocks.length;
      const focus_block_index = state.blocks.findIndex(
        (block) => block.id === state.focus_block_id
      );
      const focus_index =
        focus_block_index >= 0 ? focus_block_index + 1 : old_index;

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
        form_id: state.form_id,
        form_page_id: state.page_id,
        parent_id: block === "section" ? null : parent_id,
        type: block,
        local_index: old_index,
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

            const new_blocks = blockstreeflat(
              draft.blocks.concat({
                ...__shared,
              })
            );

            draft.blocks = new_blocks;
          });
        }
        case "field": {
          let init: { type: FormInputType } | null = null;
          if ("init" in action) {
            init = action.init;
          }

          return produce(state, (draft) => {
            const { available_field_ids } = state;

            let field_id: string | null = null;

            if (init) {
              // if init provided, always create new.
              draft.field_draft_init = init;
            } else {
              draft.field_draft_init = null;
              // find unused field id (if any)
              field_id = available_field_ids[0] ?? null;
              if (field_id) {
                // remove the field id from available_field_ids
                draft.available_field_ids = available_field_ids.filter(
                  (id) => id !== field_id
                );
              }
            }

            draft.blocks.push({
              ...__shared,
              form_field_id: field_id,
            });

            // move ==
            draft.blocks = arrayMove(draft.blocks, old_index, focus_index).map(
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
              draft.focus_field_id = null;
              draft.is_field_edit_panel_open = true;
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
            draft.blocks = arrayMove(draft.blocks, old_index, focus_index).map(
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
      const { block_id } = <CreateFielFromBlockdAction>action;
      // trigger new field from empty field block
      return produce(state, (draft) => {
        draft.field_draft_init = null;
        // update focus block id
        draft.focus_block_id = block_id;
        draft.focus_field_id = null;
        // open a field editor panel
        draft.is_field_edit_panel_open = true;
      });
    }
    case "blocks/resolve": {
      const { block_id, block } = <ResolvePendingBlockAction>action;

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
      const { block_id } = <DeleteBlockAction>action;
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
          draft.available_field_ids.push(field_id);
        }
      });
    }
    case "blocks/hidden": {
      const { block_id, v_hidden } = <BlockVHiddenAction>action;
      return produce(state, (draft) => {
        const block = draft.blocks.find((b) => b.id === block_id);
        if (block) {
          block.v_hidden = v_hidden;
        }
      });
    }
    case "blocks/title": {
      const { block_id, title_html } = <BlockTitleAction>action;
      return produce(state, (draft) => {
        const block = draft.blocks.find((b) => b.id === block_id);
        if (block) {
          block.title_html = title_html;
        }
      });
    }
    case "blocks/description": {
      const { block_id, description_html } = <BlockDescriptionAction>action;
      return produce(state, (draft) => {
        const block = draft.blocks.find((b) => b.id === block_id);
        if (block) {
          block.description_html = description_html;
        }
      });
    }
    case "blocks/field/change": {
      const { block_id, field_id } = <ChangeBlockFieldAction>action;
      return produce(state, (draft) => {
        const block = draft.blocks.find((b) => b.id === block_id);
        if (block) {
          const previous_field_id = block.form_field_id;
          block.form_field_id = field_id;

          // update the available_field_ids
          draft.available_field_ids = [
            ...draft.available_field_ids.filter((id) => id !== field_id),
            previous_field_id,
          ].filter(Boolean) as string[];
        }
      });
    }
    case "blocks/html/body": {
      const { block_id, html } = <HtmlBlockBodyAction>action;
      return produce(state, (draft) => {
        const block = draft.blocks.find((b) => b.id === block_id);
        console.log("html block body", block_id, html);
        if (block && block.type === "html") {
          block.body_html = html;
        }
      });
    }
    case "blocks/image/src": {
      const { block_id, src } = <ImageBlockSrcAction>action;
      return produce(state, (draft) => {
        const block = draft.blocks.find((b) => b.id === block_id);
        if (block && block.type === "image") {
          block.src = src;
        }
      });
    }
    case "blocks/video/src": {
      const { block_id, src } = <VideoBlockSrcAction>action;
      return produce(state, (draft) => {
        const block = draft.blocks.find((b) => b.id === block_id);
        if (block && block.type === "video") {
          block.src = src;
        }
      });
    }
    case "blocks/sort": {
      const { block_id, over_id } = <SortBlockAction>action;
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
      const { block_id } = <FocusBlockAction>action;
      return produce(state, (draft) => {
        draft.focus_block_id = block_id;
      });
    }
    case "blocks/blur": {
      return produce(state, (draft) => {
        draft.focus_block_id = null;
      });
    }
    case "editor/field/focus": {
      const { field_id } = <FocusFieldAction>action;
      return produce(state, (draft) => {
        draft.focus_field_id = field_id;
      });
    }
    case "editor/field/edit": {
      const { field_id, open, refresh } = <OpenEditFieldAction>action;
      return produce(state, (draft) => {
        draft.is_field_edit_panel_open = open ?? true;
        draft.focus_field_id = field_id;
        if (refresh) {
          draft.field_edit_panel_refresh_key =
            (draft.field_edit_panel_refresh_key ?? 0) + 1;
        }
      });
    }
    case "editor/field/save": {
      const { field_id, data } = <SaveFieldAction>action;
      return produce(state, (draft) => {
        const field = draft.fields.find((f) => f.id === field_id);
        if (field) {
          Object.assign(field, { ...data });
          field.id = field_id;
        } else {
          // create new field
          draft.fields.push({
            ...data,
          });

          let unused_field_id: string | null = field_id;

          // clear init
          draft.field_draft_init = null;

          // if new field, and focus block has no assigned field, use this.
          if (draft.focus_block_id) {
            const block = draft.blocks.find(
              (d) => d.id == draft.focus_block_id
            );

            if (block && block.type === "field" && !block.form_field_id) {
              block.form_field_id = unused_field_id;
              unused_field_id = null;
            }
          }

          // add the field_id to available_field_ids
          if (unused_field_id) draft.available_field_ids.push(unused_field_id);
        }
        //
      });
    }
    case "editor/field/delete": {
      const { field_id } = <DeleteFieldAction>action;
      return produce(state, (draft) => {
        // remove from fields
        draft.fields = draft.fields.filter((f) => f.id !== field_id);

        // remove from available_field_ids
        draft.available_field_ids = draft.available_field_ids.filter(
          (id) => id !== field_id
        );

        // set empty to referenced blocks
        draft.blocks = draft.blocks.map((block) => {
          if (block.form_field_id === field_id) {
            block.form_field_id = null;
          }
          return block;
        });
      });
    }
    case "editor/response/select": {
      const { selection } = <SelectResponse>action;
      return produce(state, (draft) => {
        draft.selected_rows = new Set(selection);
      });
    }
    case "editor/response/delete": {
      const { id } = <DeleteResponseAction>action;
      return produce(state, (draft) => {
        draft.responses.rows = draft.responses.rows.filter(
          (response) => response.id !== id
        );

        // also remove from selected_responses
        const new_selected_responses = new Set(state.selected_rows);
        new_selected_responses.delete(id);

        draft.selected_rows = new_selected_responses;
      });
    }
    case "editor/data-grid/rows": {
      const { rows: max } = <DataGridRowsAction>action;
      return produce(state, (draft) => {
        draft.datagrid_rows_per_page = max;
      });
    }
    case "editor/response/feed": {
      const { data, reset } = <FeedResponseAction>action;

      const responses = {
        rows: data,
        fields: data.reduce((acc: any, response) => {
          acc[response.id] = response.fields;
          return acc;
        }, {}),
      };

      return produce(state, (draft) => {
        if (reset) {
          draft.responses = responses;
          return;
        }

        // Merge & Add new responses to the existing responses
        // Map of ids to responses for the existing responses
        const existingResponsesById = draft.responses.rows.reduce(
          (acc: any, response) => {
            acc[response.id] = response;
            return acc;
          },
          {}
        );

        responses.rows.forEach((newResponse) => {
          if (existingResponsesById.hasOwnProperty(newResponse.id)) {
            // Update existing response
            Object.assign(
              (existingResponsesById as any)[newResponse.id],
              newResponse
            );
          } else {
            // Add new response if id does not exist
            draft.responses.rows.push(newResponse);
          }

          // Update fields
          draft.responses.fields[newResponse.id] = newResponse.fields;
        });
      });
    }
    case "editor/responses/edit": {
      const { response_id, open } = <OpenResponseEditAction>action;
      return produce(state, (draft) => {
        draft.is_response_edit_panel_open = open ?? true;
        draft.focus_response_id = response_id;
      });
    }
    case "editor/data/sessions/feed": {
      const { data, reset } = <FeedResponseSessionsAction>action;
      return produce(state, (draft) => {
        // Initialize draft.sessions if it's not already an array
        if (!Array.isArray(draft.sessions)) {
          draft.sessions = [];
        }

        if (reset) {
          draft.sessions = data;
          return;
        }

        // Merge & Add new responses to the existing responses
        // Map of ids to responses for the existing responses
        const existingSessionsById = draft.sessions.reduce(
          (acc: any, session) => {
            acc[session.id] = session;
            return acc;
          },
          {}
        );

        data.forEach((newSession) => {
          if (existingSessionsById.hasOwnProperty(newSession.id)) {
            // Update existing response
            Object.assign(
              (existingSessionsById as any)[newSession.id],
              newSession
            );
          } else {
            // Add new response if id does not exist
            draft.sessions!.push(newSession);
          }
        });
      });
    }
    case "editor/data-grid/table": {
      const { table } = <DataGridTableAction>action;
      return produce(state, (draft) => {
        draft.datagrid_table = table;

        draft.realtime_sessions_enabled = table === "session";
        draft.realtime_responses_enabled = table === "response";

        // clear selected rows
        draft.selected_rows = new Set();
      });
    }
    case "editor/data-grid/delete/selected": {
      const {} = <DataGridDeleteSelectedRows>action;
      return produce(state, (draft) => {
        switch (state.datagrid_table) {
          case "response": {
            const ids = Array.from(state.selected_rows);
            draft.responses.rows = draft.responses.rows.filter(
              (response) => !ids.includes(response.id)
            );

            break;
          }
          case "x-supabase-main-table": {
            const pk = state.x_supabase_main_table!.gfpk!;
            draft.x_supabase_main_table!.rows =
              draft.x_supabase_main_table!.rows.filter(
                (row) => !state.selected_rows.has(row[pk])
              );

            break;
          }
          case "session":
          default:
            throw new Error("Unsupported table type: " + state.datagrid_table);
        }

        // clear selected rows
        draft.selected_rows = new Set();
      });
    }
    case "editor/customers/edit": {
      const { customer_id, open } = <OpenCustomerEditAction>action;
      return produce(state, (draft) => {
        draft.is_customer_edit_panel_open = open ?? true;
        draft.focus_customer_id = customer_id;
      });
    }
    case "editor/panels/block-edit": {
      const { block_id, open } = <OpenBlockEditPanelAction>action;
      return produce(state, (draft) => {
        draft.is_block_edit_panel_open = open ?? true;
        draft.focus_block_id = block_id;
      });
    }
    case "editor/data-grid/column/reorder": {
      const { a, b } = <DataGridReorderColumnAction>action;
      return produce(state, (draft) => {
        // update field local_index
        const index_a = draft.fields.findIndex((f) => f.id === a);
        const index_b = draft.fields.findIndex((f) => f.id === b);
        // TODO:
        draft.fields = arrayMove(draft.fields, index_a, index_b);

        console.error("reorder:: Not implemented yet");
      });
    }
    case "editor/data-grid/dateformat": {
      const { dateformat } = <DataGridDateFormatAction>action;
      return produce(state, (draft) => {
        draft.dateformat = dateformat;
      });
    }
    case "editor/data-grid/tz": {
      const { tz } = <DataGridDateTZAction>action;
      return produce(state, (draft) => {
        draft.datetz = tz;
      });
    }
    case "editor/data-grid/filter": {
      const { type, ...pref } = <DataGridFilterAction>action;

      return produce(state, (draft) => {
        draft.datagrid_filter = {
          ...draft.datagrid_filter,
          ...pref,
        };
      });
    }
    case "editor/data-grid/refresh": {
      const {} = <DataTableRefreshAction>action;

      return produce(state, (draft) => {
        draft.datagrid_table_refresh_key = draft.datagrid_table_refresh_key + 1;
      });
    }
    case "editor/data-grid/loading": {
      const { isloading } = <DataTableLoadingAction>action;

      return produce(state, (draft) => {
        draft.datagrid_isloading = isloading;
      });
    }
    case "editor/data-grid/cell/change": {
      return produce(state, (draft) => {
        switch (state.datagrid_table) {
          case "response": {
            const { row, column, data } = <DataGridCellChangeAction>action;
            const { value, option_id } = data;

            const cellid = state.responses.fields[row].find(
              (f) => f.form_field_id === column && f.response_id === row
            )?.id;

            draft.responses.fields[row] = draft.responses.fields[row].map(
              (f) => {
                if (f.id === cellid) {
                  return {
                    ...f,
                    form_field_option_id: option_id ?? null,
                    value,
                  };
                }
                return f;
              }
            );

            break;
          }
          case "x-supabase-main-table": {
            const {
              row: row_pk,
              column,
              data,
            } = <DataGridCellChangeAction>action;
            const { value, option_id } = data;

            const field = state.fields.find((f) => f.id === column);
            if (!field) return;
            const pk = state.x_supabase_main_table!.gfpk!;

            // handle jsonpaths - partial object update
            if (FlatPostgREST.testPath(field.name)) {
              const { column } = FlatPostgREST.decodePath(field.name);
              const row = state.x_supabase_main_table!.rows.find(
                (r) => r[pk] === row_pk
              );

              if (!row) return;

              const newrow = FlatPostgREST.update(
                row,
                field.name,
                value
              ) as GridaSupabase.XDataRow;

              draft.x_supabase_main_table!.rows =
                draft.x_supabase_main_table!.rows.map((r) => {
                  if (r[pk] === row_pk) {
                    return newrow;
                  }
                  return r;
                });

              return;
            }

            draft.x_supabase_main_table!.rows =
              draft.x_supabase_main_table!.rows.map((r) => {
                if (r[pk] === row_pk) {
                  return {
                    ...r,
                    [field!.name]: value,
                  };
                }
                return r;
              });

            break;
          }
          case "session":
          default: {
            throw new Error("Unsupported table type: " + state.datagrid_table);
          }
        }
      });
    }
    case "editor/x-supabase/main-table/feed": {
      const { data } = <FeedXSupabaseMainTableRowsAction>action;

      return produce(state, (draft) => {
        draft.x_supabase_main_table!.rows = data;
        return;
      });
      //
    }
    case "editor/theme/palette": {
      const { palette } = <EditorThemePaletteAction>action;
      return produce(state, (draft) => {
        draft.theme.palette = palette;
      });
    }
    case "editor/theme/font-family": {
      const { fontFamily } = <EditorThemeFontFamilyAction>action;
      return produce(state, (draft) => {
        draft.theme.fontFamily = fontFamily || "inter";
      });
    }
    case "editor/theme/background": {
      const { background } = <EditorThemeBackgroundAction>action;
      return produce(state, (draft) => {
        draft.theme.background = background;
      });
    }
    case "editor/theme/section": {
      const { section } = <EditorThemeSectionStyleAction>action;
      return produce(state, (draft) => {
        draft.theme.section = section || undefined;
      });
    }
    case "editor/theme/custom-css": {
      const { custom } = <EditorThemeCustomCSSAction>action;
      return produce(state, (draft) => {
        draft.theme.customCSS = custom;
      });
    }
    //
    case "editor/document/select-page": {
      const { page_id } = <DocumentSelectPageAction>action;

      return produce(state, (draft) => {
        draft.document.selected_page_id = page_id;
      });
    }
    case "editor/document/sampledata": {
      const { sampledata } = <DocumentTemplateSampleDataAction>action;
      return produce(state, (draft) => {
        draft.document.templatesample = sampledata;
      });
    }
    case "editor/document/node/select": {
      const {
        node_id,
        node_type,
        schema,
        default_properties,
        default_style,
        default_text,
      } = <DocumentSelectNodeAction>action;
      return produce(state, (draft) => {
        draft.document.selected_node_id = node_id;
        draft.document.selected_node_type = node_type;
        draft.document.selected_node_schema = schema || null;
        draft.document.selected_node_default_properties = default_properties;
        draft.document.selected_node_default_style = default_style;
        draft.document.selected_node_default_text = default_text;
      });
    }
    case "editor/document/node/template": {
      const { node_id, template_id } = <DocumentNodeChangeTemplateAction>action;
      return produce(state, (draft) => {
        draft.document.templatedata[node_id] = {
          ...(draft.document.templatedata[node_id] || {}),
          template_id,
        };
      });
    }
    case "editor/document/node/text": {
      const { node_id, text } = <DocumentNodeChangeTextAction>action;
      return produce(state, (draft) => {
        draft.document.templatedata[node_id] = {
          ...(draft.document.templatedata[node_id] || {}),
          text,
        };
      });
    }
    case "editor/document/node/style": {
      const { node_id, data } = <DocumentNodeUpdateStyleAction>action;
      return produce(state, (draft) => {
        draft.document.templatedata[node_id] = {
          ...(draft.document.templatedata[node_id] || {}),
          style: {
            ...(draft.document.templatedata[node_id]?.style || {}),
            ...data,
          },
        };
      });
    }
    case "editor/document/node/attribute": {
      const { node_id, data } = <DocumentNodeUpdateAttributeAction>action;
      return produce(state, (draft) => {
        draft.document.templatedata[node_id] = {
          ...(draft.document.templatedata[node_id] || {}),
          attributes: {
            ...(draft.document.templatedata[node_id]?.attributes || {}),
            ...data,
          },
        };
      });
    }
    case "editor/document/node/property": {
      const { node_id, data } = <DocumentNodeUpdatePropertyAction>action;
      return produce(state, (draft) => {
        draft.document.templatedata[node_id] = {
          ...(draft.document.templatedata[node_id] || {}),
          properties: {
            ...(draft.document.templatedata[node_id]?.properties || {}),
            ...data,
          },
        };
      });
    }
    default:
      return state;
  }
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
