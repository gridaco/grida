import { produce, type Draft } from "immer";
import type {
  EditorFlatFormBlock,
  EditorState,
  GDocFormsXSBTable,
  GDocSchemaTableProviderXSupabase,
  GDocTable,
  GDocTableID,
  TTablespace,
  TVirtualRow,
  TVirtualRowData,
  TXSupabaseDataTablespace,
} from "./state";
import type {
  GlobalSavingAction,
  EditorSidebarModeAction,
  BlockDescriptionAction,
  BlockTitleAction,
  BlockVHiddenAction,
  BlocksEditorAction,
  ChangeBlockFieldAction,
  CreateFielFromBlockdAction,
  CreateNewPendingBlockAction,
  DataGridReorderColumnAction,
  DeleteBlockAction,
  TableAttributeDeleteAction,
  DeleteResponseAction,
  DataGridDeleteSelectedRows,
  TablespaceFeedAction,
  FocusBlockAction,
  HtmlBlockBodyAction,
  ImageBlockSrcAction,
  OpenInsertMenuPanelAction,
  OpenCustomerEditAction,
  OpenEditFieldAction,
  OpenResponseEditAction,
  ResolvePendingBlockAction,
  DataGridRowsAction,
  TableAttributeChangeAction,
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
  EditorThemeLangAction,
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
  DataGridOrderByAction,
  DataGridOrderByResetAction,
  InitAssetAction,
  FeedCustomerAction,
  EditorThemePoweredByBrandingAction,
  FormCampaignPreferencesAction,
  FormEndingPreferencesAction,
  EditorThemeAppearanceAction,
  SchemaTableAddAction,
  SchemaTableDeleteAction,
} from "./action";
import { arrayMove } from "@dnd-kit/sortable";
import { blockstreeflat } from "@/lib/forms/tree";
import { HTML_BLOCK_BODY_HTML_DEFAULT_VALUE } from "@/k/html_block_defaults";
import { VIDEO_BLOCK_SRC_DEFAULT_VALUE } from "@/k/video_block_defaults";
import { IMAGE_BLOCK_SRC_DEFAULT_VALUE } from "@/k/image_block_defaults";
import { PDF_BLOCK_SRC_DEFAULT_VALUE } from "@/k/pdf_block_defaults";
import { draftid } from "@/utils/id";
import type {
  AttributeDefinition,
  FormBlockType,
  FormInputType,
  FormResponse,
  FormResponseField,
  GridaXSupabase,
} from "@/types";
import { FlatPostgREST } from "@/lib/supabase-postgrest/flat";
import { EditorSymbols } from "./symbols";
import {
  initialDatagridState,
  schematableinit,
  table_to_sidebar_table_menu,
} from "./init";
import assert from "assert";

export function reducer(
  state: EditorState,
  action: BlocksEditorAction
): EditorState {
  switch (action.type) {
    case "saving": {
      const { saving } = <GlobalSavingAction>action;
      return produce(state, (draft) => {
        draft.saving = saving;
      });
    }
    case "editor/sidebar/mode": {
      const { mode } = <EditorSidebarModeAction>action;
      return produce(state, (draft) => {
        draft.sidebar.mode = mode;
      });
    }
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
        form_id: state.form.form_id,
        form_page_id: state.document_id,
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
          draft.form.available_field_ids.push(field_id);
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
          draft.form.available_field_ids = [
            ...draft.form.available_field_ids.filter((id) => id !== field_id),
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
    case "editor/assets/init": {
      const { type, ...pref } = <InitAssetAction>action;
      return produce(state, (draft) => {
        draft.assets = {
          ...draft.assets,
          ...pref,
        };
      });
    }
    case "editor/field/edit": {
      const { field_id, open, refresh } = <OpenEditFieldAction>action;
      return produce(state, (draft) => {
        draft.field_editor.open = open ?? true;
        draft.field_editor.id = field_id;
        draft.field_editor.refreshkey = nextrefreshkey(
          draft.field_editor.refreshkey,
          refresh
        );
      });
    }
    case "editor/table/attribute/change": {
      const { table_id, field_id, data } = <TableAttributeChangeAction>action;

      return produce(state, (draft) => {
        // clear init
        draft.field_editor.data = { draft: null };

        // update (create) the changed attribute
        const attributes = get_attributes(draft, table_id);
        const { isnew } = push_or_update_attribute(attributes, data);

        if (draft.doctype === "v0_form") {
          if (isnew) {
            // assign the field_id to the block if required
            let unused_field_id: string | null = field_id;
            const waiting_block = has_waiting_block_for_new_field(draft);

            if (waiting_block) {
              waiting_block.form_field_id = unused_field_id;
              unused_field_id = null;
            } else {
              // add the field_id to available_field_ids
              draft.form.available_field_ids.push(unused_field_id);
            }
          }
        }
        //
      });
    }
    case "editor/table/attribute/delete": {
      const { table_id, field_id } = <TableAttributeDeleteAction>action;
      return produce(state, (draft) => {
        const attributes = get_attributes(draft, table_id);

        // [EXECUTION ORDER MATTERS] remove from attributes (using below syntax since attribute is a const - still a draft proxy)
        const new_attributes = attributes.filter(
          (attr) => attr.id !== field_id
        );
        attributes.length = 0;
        attributes.push(...new_attributes);
        //

        if (draft.doctype === "v0_form") {
          // remove from available_field_ids
          draft.form.available_field_ids =
            draft.form.available_field_ids.filter((id) => id !== field_id);

          // set empty to referenced blocks
          draft.blocks = draft.blocks.map((block) => {
            if (block.form_field_id === field_id) {
              block.form_field_id = null;
            }
            return block;
          });
        }
      });
    }
    case "editor/response/select": {
      const { selection } = <SelectResponse>action;
      return produce(state, (draft) => {
        draft.datagrid_selected_rows = new Set(selection);
      });
    }
    case "editor/response/delete": {
      const { id } = <DeleteResponseAction>action;
      return produce(state, (draft) => {
        const space = get_tablespace_feed(draft);
        if (!space) {
          console.error("Table space not found");
          return;
        }

        space.stream = space.stream?.filter((row) => row.id !== id);

        // also remove from selected_responses
        const new_selected_responses = new Set(state.datagrid_selected_rows);
        new_selected_responses.delete(id);

        draft.datagrid_selected_rows = new_selected_responses;
      });
    }
    case "editor/data-grid/rows": {
      const { rows: max } = <DataGridRowsAction>action;
      return produce(state, (draft) => {
        draft.datagrid_rows_per_page = max;
      });
    }
    case "editor/table/space/feed": {
      const { data, reset } = <TablespaceFeedAction>action;

      const virtualized: Array<TVirtualRow<FormResponseField, FormResponse>> =
        data.map((vrow) => {
          const { fields, ...row } = vrow;
          return {
            id: row.id,
            data: fields.reduce(
              (acc: TVirtualRowData<FormResponseField>, field) => {
                const attrkey = field.form_field_id;
                acc[attrkey] = field;
                return acc;
              },
              {}
            ),
            meta: row,
          };
        });

      return produce(state, (draft) => {
        const space = get_tablespace_feed(draft);

        assert(space, "Table space not found");

        if (reset) {
          space.stream = virtualized;
          return;
        }

        // Merge & Add new responses to the existing responses
        // Map of ids to responses for the existing responses
        // { [id] : row}
        const existing_rows_id_map = space.stream?.reduce((acc: any, row) => {
          acc[row.id] = row;
          return acc;
        }, {});

        virtualized.forEach((newRow) => {
          if (existing_rows_id_map.hasOwnProperty(newRow.id)) {
            // Update existing response
            Object.assign((existing_rows_id_map as any)[newRow.id], newRow);
          } else {
            // Add new response if id does not exist
            space.stream?.push(newRow);
          }
        });
      });
    }
    case "editor/responses/edit": {
      const { response_id, open, refresh } = <OpenResponseEditAction>action;
      return produce(state, (draft) => {
        draft.row_editor.open = open ?? true;
        draft.row_editor.id = response_id;
        draft.row_editor.refreshkey = nextrefreshkey(
          draft.row_editor.refreshkey,
          refresh
        );
      });
    }
    case "editor/data/sessions/feed": {
      const { data, reset } = <FeedResponseSessionsAction>action;
      return produce(state, (draft) => {
        // Initialize session stream if it's not already an array
        const session_space =
          draft.tablespace[
            EditorSymbols.Table.SYM_GRIDA_FORMS_SESSION_TABLE_ID
          ];

        if (!Array.isArray(session_space.stream)) {
          session_space.stream = [];
        }

        if (reset) {
          session_space.stream = data;
          return;
        }

        // Merge & Add new responses to the existing responses
        // Map of ids to responses for the existing responses
        const existingSessionsById = session_space.stream.reduce(
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
            session_space.stream?.push(newSession);
          }
        });
      });
    }
    case "editor/data-grid/table": {
      const { ...opt } = <DataGridTableAction>action;
      return produce(state, (draft) => {
        // find the id =====
        let tableid: GDocTableID | null = null;
        if ("id" in opt) {
          tableid = opt.id;
        }
        // TODO: ...
        // else {
        //   // find withind current group.
        //   const group = draft.tables.find((g) =>
        //     g.views.some((v) => v.id === draft.datagrid_table_id)
        //   );
        //   tableid = group?.views.find((v) => v.name === opt.name)?.id ?? null;
        // }
        // =================

        if (!tableid) {
          console.error("Table not found", opt);
          return;
        }

        draft.datagrid_table_id = tableid;

        // clear datagrid state
        const datagridreset = initialDatagridState();
        draft.datagrid_selected_rows = datagridreset.datagrid_selected_rows;
        draft.datagrid_filter = datagridreset.datagrid_filter;
        draft.datagrid_orderby = datagridreset.datagrid_orderby;

        if (draft.doctype === "v0_form") {
          // TODO: not a best way. but for now.
          if ((draft.tablespace[tableid] as never) !== "noop") {
            draft.tablespace[tableid].realtime = true;
          }
        }
      });
    }
    case "editor/data-grid/delete/selected": {
      const {} = <DataGridDeleteSelectedRows>action;
      return produce(state, (draft) => {
        switch (draft.datagrid_table_id) {
          case EditorSymbols.Table.SYM_GRIDA_FORMS_RESPONSE_TABLE_ID: {
            const ids = Array.from(state.datagrid_selected_rows);

            const response_space =
              draft.tablespace[
                EditorSymbols.Table.SYM_GRIDA_FORMS_RESPONSE_TABLE_ID
              ];
            response_space.stream = response_space.stream?.filter(
              (response) => !ids.includes(response.id)
            );

            break;
          }
          case EditorSymbols.Table.SYM_GRIDA_FORMS_X_SUPABASE_MAIN_TABLE_ID: {
            const tb = get_table<GDocFormsXSBTable>(
              draft,
              EditorSymbols.Table.SYM_GRIDA_FORMS_X_SUPABASE_MAIN_TABLE_ID
            );
            if (!tb) return;

            const pk = tb.x_sb_main_table_connection.pk!;
            const space =
              draft.tablespace[
                EditorSymbols.Table.SYM_GRIDA_FORMS_X_SUPABASE_MAIN_TABLE_ID
              ];

            space.stream = space.stream?.filter(
              (row) => !state.datagrid_selected_rows.has(row[pk])
            );

            break;
          }
          case EditorSymbols.Table.SYM_GRIDA_FORMS_SESSION_TABLE_ID: {
            throw new Error(
              "Unsupported table type: " + state.datagrid_table_id?.toString()
            );
          }
          default:
            if (draft.doctype === "v0_schema") {
              //
              const space = get_tablespace_feed(draft);

              const ids = Array.from(state.datagrid_selected_rows);

              assert(space, "Table space not found");

              space.stream = space.stream?.filter(
                (response) => !ids.includes(response.id)
              );
            } else {
              throw new Error(
                "Unsupported table type: " + state.datagrid_table_id?.toString()
              );
            }
        }

        // clear selected rows
        draft.datagrid_selected_rows = new Set();
      });
    }
    case "editor/customers/feed": {
      const { data } = <FeedCustomerAction>action;
      return produce(state, (draft) => {
        draft.tablespace[
          EditorSymbols.Table.SYM_GRIDA_CUSTOMER_TABLE_ID
        ].stream = data;
      });
    }
    case "editor/customers/edit": {
      const { customer_id, open } = <OpenCustomerEditAction>action;
      return produce(state, (draft) => {
        draft.customer_editor.open = open ?? true;
        draft.customer_editor.id = customer_id;
      });
    }
    case "editor/panels/insert-menu": {
      const { open } = <OpenInsertMenuPanelAction>action;
      return produce(state, (draft) => {
        draft.insertmenu.open = open ?? true;
      });
    }
    case "editor/data-grid/column/reorder": {
      const { a, b } = <DataGridReorderColumnAction>action;
      return produce(state, (draft) => {
        // update field local_index
        const index_a = draft.form.fields.findIndex((f) => f.id === a);
        const index_b = draft.form.fields.findIndex((f) => f.id === b);
        // TODO:
        draft.form.fields = arrayMove(draft.form.fields, index_a, index_b);

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
    case "editor/data-grid/orderby": {
      const { column_id, data } = <DataGridOrderByAction>action;
      return produce(state, (draft) => {
        if (data === null) {
          delete draft.datagrid_orderby[column_id];
          return;
        }

        draft.datagrid_orderby[column_id] = {
          column: column_id,
          ...data,
        };
      });
    }
    case "editor/data-grid/orderby/reset": {
      const {} = <DataGridOrderByResetAction>action;
      return produce(state, (draft) => {
        draft.datagrid_orderby = {};
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
        switch (draft.datagrid_table_id) {
          case EditorSymbols.Table.SYM_GRIDA_FORMS_RESPONSE_TABLE_ID: {
            const {
              row: row_id,
              column: attribute_id,
              data,
            } = <DataGridCellChangeAction>action;
            const { value, option_id } = data;

            const response_space =
              draft.tablespace[
                EditorSymbols.Table.SYM_GRIDA_FORMS_RESPONSE_TABLE_ID
              ];
            const cell = response_space.stream?.find(
              (row) => row.id === row_id
            )!.data[attribute_id];

            if (!cell) return;

            cell.value = value;
            cell.form_field_option_id = option_id ?? null;

            break;
          }
          case EditorSymbols.Table.SYM_GRIDA_FORMS_X_SUPABASE_MAIN_TABLE_ID: {
            const space =
              draft.tablespace[
                EditorSymbols.Table.SYM_GRIDA_FORMS_X_SUPABASE_MAIN_TABLE_ID
              ];

            const tb = get_table<GDocFormsXSBTable>(
              draft,
              EditorSymbols.Table.SYM_GRIDA_FORMS_X_SUPABASE_MAIN_TABLE_ID
            );
            if (!tb) return;
            const pk = tb.x_sb_main_table_connection.pk!;

            update_xsbtablespace(pk, space, draft, action);
            break;
          }
          case EditorSymbols.Table.SYM_GRIDA_FORMS_SESSION_TABLE_ID: {
            throw new Error(
              "Unsupported table type: " + state.datagrid_table_id?.toString()
            );
          }
          default: {
            if (draft.doctype === "v0_schema") {
              const {
                row: row_id,
                column: attribute_id,
                data,
              } = <DataGridCellChangeAction>action;
              const { value, option_id } = data;

              const space = get_tablespace_feed(draft);
              assert(space, "Table space not found");

              switch (space?.provider) {
                case "grida": {
                  const cell = space.stream?.find((row) => row.id === row_id)!
                    .data[attribute_id];

                  if (!cell) return;

                  cell.value = value;
                  cell.form_field_option_id = option_id ?? null;
                  break;
                }
                case "x-supabase": {
                  const space = draft.tablespace[action.table_id];
                  assert(space.provider === "x-supabase");

                  const tb = get_table<GDocSchemaTableProviderXSupabase>(
                    draft,
                    action.table_id
                  );

                  if (!tb) return;

                  const pk = tb.x_sb_main_table_connection.pk!;

                  update_xsbtablespace(
                    pk,
                    space as TXSupabaseDataTablespace,
                    draft,
                    action
                  );
                  break;
                }
                case "custom":
                default:
                  throw new Error(
                    "Unsupported table provider: " + space?.provider
                  );
              }

              break;
            } else {
              throw new Error(
                "Unsupported table type: " + state.datagrid_table_id?.toString()
              );
            }
          }
        }
      });
    }
    case "editor/table/space/feed/x-supabase": {
      const { data, table_id } = <FeedXSupabaseMainTableRowsAction>action;

      return produce(state, (draft) => {
        draft.tablespace[table_id].stream = data;
        return;
      });
      //
    }
    case "editor/theme/lang": {
      const { lang } = <EditorThemeLangAction>action;
      return produce(state, (draft) => {
        draft.theme.lang = lang;
      });
    }
    case "editor/theme/powered_by_branding": {
      const { enabled } = <EditorThemePoweredByBrandingAction>action;
      return produce(state, (draft) => {
        draft.theme.is_powered_by_branding_enabled = enabled;
      });
    }
    case "editor/theme/palette": {
      const { palette } = <EditorThemePaletteAction>action;
      return produce(state, (draft) => {
        draft.theme.palette = palette;
      });
    }
    case "editor/theme/appearance": {
      const { appearance } = <EditorThemeAppearanceAction>action;
      return produce(state, (draft) => {
        draft.theme.appearance = appearance;
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
    case "editor/form/campaign/preferences": {
      const { type, ...pref } = <FormCampaignPreferencesAction>action;
      return produce(state, (draft) => {
        draft.campaign = {
          ...draft.campaign,
          ...pref,
        };
      });
    }
    case "editor/form/ending/preferences": {
      const { type, ...pref } = <FormEndingPreferencesAction>action;
      return produce(state, (draft) => {
        draft.form.ending = {
          ...draft.form.ending,
          ...pref,
        };
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
        context,
        default_properties,
        default_style,
        default_text,
      } = <DocumentSelectNodeAction>action;
      return produce(state, (draft) => {
        draft.document.selected_node_id = node_id;
        draft.document.selected_node_type = node_type;
        draft.document.selected_node_schema = schema || null;
        draft.document.selected_node_context = context;
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
    case "editor/schema/table/add": {
      const { table } = <SchemaTableAddAction>action;
      return produce(state, (draft) => {
        const tb = schematableinit(table);
        draft.tables.push(tb as Draft<GDocTable>);
        draft.sidebar.mode_data.tables.push(
          table_to_sidebar_table_menu(tb, {
            basepath: draft.basepath,
            document_id: draft.document_id,
          })
        );

        if (table.x_sb_main_table_connection) {
          draft.tablespace[tb.id] = {
            provider: "x-supabase",
            readonly: false,
            stream: [],
            realtime: false,
          };
        } else {
          draft.tablespace[tb.id] = {
            provider: "grida",
            readonly: false,
            stream: [],
            realtime: true,
          };
        }

        // TODO: setting the id won't change the route. need to update the route. (where?)
        draft.datagrid_table_id = table.id;
      });
    }
    case "editor/schema/table/delete": {
      const { table_id } = <SchemaTableDeleteAction>action;
      return produce(state, (draft) => {
        const table = draft.tables.find((t) => t.id === table_id);
        if (table) {
          draft.tables = draft.tables.filter((t) => t.id !== table_id);
          draft.sidebar.mode_data.tables =
            draft.sidebar.mode_data.tables.filter((t) => t.id !== table_id);
          delete draft.tablespace[table_id];
          draft.datagrid_table_id = null;
        }
      });
    }
    default:
      return state;
  }
}

function update_xsbtablespace(
  pk: string,
  space: Draft<TXSupabaseDataTablespace>,
  draft: Draft<EditorState>,
  action: DataGridCellChangeAction
) {
  const { row: row_pk, table_id, column, data } = action;
  const { value, option_id } = data;

  const attributes = get_attributes(draft, table_id);
  const attribute = attributes.find((f) => f.id === column);
  if (!attribute) return;

  // handle jsonpaths - partial object update
  if (FlatPostgREST.testPath(attribute.name)) {
    const { column } = FlatPostgREST.decodePath(attribute.name);
    const row = space.stream!.find((r) => r[pk] === row_pk);

    if (!row) return;

    const newrow = FlatPostgREST.update(
      row,
      attribute.name,
      value
    ) as GridaXSupabase.XDataRow;

    space.stream = space.stream!.map((r) => {
      if (r[pk] === row_pk) {
        return newrow;
      }
      return r;
    });

    return;
  }

  space.stream = space.stream!.map((r) => {
    if (r[pk] === row_pk) {
      return {
        ...r,
        [attribute!.name]: value,
      };
    }
    return r;
  });
}

function get_table<T extends GDocTable>(
  draft: Draft<EditorState>,
  table_id: GDocTableID
): Draft<Extract<GDocTable, T>> | undefined {
  return draft.tables.find((t) => t.id === table_id) as Draft<
    Extract<GDocTable, T>
  >;
}

function get_tablespace_feed(
  draft: Draft<EditorState>
): Draft<TTablespace> | null {
  switch (draft.doctype) {
    case "v0_form":
      return draft.tablespace[
        EditorSymbols.Table.SYM_GRIDA_FORMS_RESPONSE_TABLE_ID
      ];
    case "v0_schema":
      if (typeof draft.datagrid_table_id === "string")
        return draft.tablespace[draft.datagrid_table_id] as TTablespace;
    default:
      return null;
  }
  //
}

function get_attributes(draft: Draft<EditorState>, table_id: GDocTableID) {
  switch (draft.doctype) {
    case "v0_form":
      return draft.form.fields;

    case "v0_schema": {
      const tb = draft.tables.find((t) => t.id === table_id);
      assert(tb, "Table not found");
      assert("attributes" in tb, "Not a valid table");
      return tb.attributes;
    }
    default:
      throw new Error("cannot get attributes - unsupported doctype");
  }
}

function push_or_update_attribute(
  attributes: Draft<Array<AttributeDefinition>>,
  data: AttributeDefinition
) {
  const attribute = attributes.find((f) => f.id === data.id);
  if (attribute) {
    Object.assign(attribute, { ...data });
    return {
      isnew: false,
      attribute,
    };
  } else {
    attributes.push(data);
    return {
      isnew: true,
      attribute: attributes.find((f) => f.id === data.id),
    };
  }
}

/**
 * check if there is a waiting block for new field.
 * when creating a new field on certain ux, we create the block first then open a new field panel, once saved, we may use this for finding the block.
 * @param draft
 * @returns
 */
function has_waiting_block_for_new_field(draft: Draft<EditorState>) {
  if (draft.focus_block_id) {
    const block = draft.blocks.find((d) => d.id == draft.focus_block_id);

    if (block && block.type === "field" && !block.form_field_id) {
      return block;
    }

    return false;
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

/**
 * refresh by adding 1 to number based refresh key
 */
function nextrefreshkey(curr: number | undefined, refresh: boolean = true) {
  if (refresh) {
    return curr ? curr + 1 : 0;
  }
  return curr;
}
