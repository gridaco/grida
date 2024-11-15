import { produce, type Draft } from "immer";
import type { EditorState, GDocTableID } from "./state";
import type {
  EditorAction,
  GlobalSavingAction,
  EditorSidebarModeAction,
  DataGridReorderColumnAction,
  OpenInsertMenuPanelAction,
  OpenCustomerDetailsPanelAction,
  OpenFieldEditPanelAction,
  OpenRecordEditPanelAction,
  DataGridTableAction,
  DataGridDateFormatAction,
  DataGridDateTZAction,
  DataGridLocalFilterAction,
  DataTableLoadingAction,
  EditorDocumentAction,
  EditorThemeLangAction,
  EditorThemePaletteAction,
  EditorThemeFontFamilyAction,
  EditorThemeBackgroundAction,
  EditorThemeSectionStyleAction,
  EditorThemeCustomCSSAction,
  InitAssetAction,
  FeedCustomerAction,
  EditorThemePoweredByBrandingAction,
  FormCampaignPreferencesAction,
  FormEndingPreferencesAction,
  EditorThemeAppearanceAction,
  // DataGridViewAction,
  DataGridTableViewAction,
  DataGridSelectCellAction,
  EditorSelectPageAction,
  FormStartPageInitAction,
} from "./action";
import { arrayMove } from "@dnd-kit/sortable";
import { EditorSymbols } from "./symbols";
import { initialDatagridState } from "./init";
import { DataGridLocalPreferencesStorage } from "./storage/datagrid.storage";
import databaseRecucer from "./reducers/database.reducer";
import blockReducer from "./reducers/block.reducer";
import datagridQueryReducer from "../data-query/data-query.reducer";
import builderReducer from "@/builder/reducer";
import assert from "assert";
import React from "react";
import { grida } from "@/grida";
import { IDocumentEditorState, initDocumentEditorState } from "@/builder/types";

export function reducer(state: EditorState, action: EditorAction): EditorState {
  switch (action.type) {
    case "editor/table/space/feed":
    case "editor/table/space/feed/x-supabase":
    case "editor/table/space/rows/delete":
    case "editor/table/space/cell/change":
    case "editor/table/space/transactions/status":
    case "editor/table/space/rows/select":
    case "editor/table/space/rows/delete/selected":
    case "editor/table/space/feed/sessions":
    case "editor/table/attribute/change":
    case "editor/table/attribute/delete":
    case "editor/table/schema/add":
    case "editor/table/schema/delete":
      return databaseRecucer(state, action);

    // #region datagrid query
    case "data/query/refresh":
    case "data/query/page-limit":
    case "data/query/page-index":
    case "data/query/orderby":
    case "data/query/orderby/remove":
    case "data/query/orderby/clear":
    case "data/query/predicates/add":
    case "data/query/predicates/clear":
    case "data/query/predicates/remove":
    case "data/query/predicates/update":
    case "data/query/textsearch/column":
    case "data/query/textsearch/query":
    case "data/query/textsearch/clear": {
      return produce(state, (draft) => {
        draft.datagrid_query = datagridQueryReducer(
          draft.datagrid_query!,
          action
        );

        on_datagrid_pref_change(draft, {
          view_id: tmp_view_id(draft),
        });
      });
    }
    // #endregion datagrid query

    case "blocks/new":
    case "blocks/field/new":
    case "blocks/resolve":
    case "blocks/delete":
    case "blocks/hidden":
    case "blocks/title":
    case "blocks/description":
    case "blocks/field/change":
    case "blocks/html/body":
    case "blocks/image/src":
    case "blocks/video/src":
    case "blocks/sort":
    case "blocks/focus":
    case "blocks/blur":
      return blockReducer(state, action);

    case "editor/document": {
      const { key, action: _action } = <EditorDocumentAction>action;
      return produce(state, (draft) => {
        assert(draft.documents, "draft.documents is required");
        const document = draft.documents[key];
        assert(document, "document is required");
        draft.documents[key] = builderReducer(
          state.documents[key]!,
          _action
        ) as IDocumentEditorState & { template_id: string };
      });
    }

    case "saving": {
      const { saving } = <GlobalSavingAction>action;
      return produce(state, (draft) => {
        draft.saving = saving;
      });
    }

    case "editor/select-page": {
      const { page_id } = <EditorSelectPageAction>action;

      return produce(state, (draft) => {
        draft.selected_page_id = page_id;
      });
    }

    case "editor/sidebar/mode": {
      const { mode } = <EditorSidebarModeAction>action;
      return produce(state, (draft) => {
        draft.sidebar.mode = mode;
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
    // #region editor/panels
    case "editor/panels/field-edit": {
      const { field_id, open, refresh } = <OpenFieldEditPanelAction>action;
      return produce(state, (draft) => {
        draft.field_editor.open = open ?? true;
        draft.field_editor.id = field_id;
        draft.field_editor.refreshkey = nextrefreshkey(
          draft.field_editor.refreshkey,
          refresh
        );
      });
    }
    case "editor/panels/record-edit": {
      const { response_id, open, refresh } = <OpenRecordEditPanelAction>action;
      return produce(state, (draft) => {
        draft.row_editor.open = open ?? true;
        draft.row_editor.id = response_id;
        draft.row_editor.refreshkey = nextrefreshkey(
          draft.row_editor.refreshkey,
          refresh
        );
      });
    }
    case "editor/panels/customer-details": {
      const { customer_id, open } = <OpenCustomerDetailsPanelAction>action;
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
    // #endregion editor/panels

    case "editor/customers/feed": {
      const { data } = <FeedCustomerAction>action;
      return produce(state, (draft) => {
        draft.tablespace[
          EditorSymbols.Table.SYM_GRIDA_CUSTOMER_TABLE_ID
        ].stream = data;
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

        // [ORDER MATTERS] 1. update the table id
        draft.datagrid_table_id = tableid;

        // [ORDER MATTERS] 2. get view id via table id
        // clear datagrid state
        const datagridreset = initialDatagridState(tmp_view_id(draft));
        draft.datagrid_query_estimated_count =
          datagridreset.datagrid_query_estimated_count;
        draft.datagrid_query = datagridreset.datagrid_query;
        draft.datagrid_selected_rows = datagridreset.datagrid_selected_rows;
        draft.datagrid_local_filter = datagridreset.datagrid_local_filter;
        draft.datagrid_selected_cell = datagridreset.datagrid_selected_cell;

        if (draft.doctype === "v0_form") {
          // TODO: not a best way. but for now.
          if ((draft.tablespace[tableid] as never) !== "noop") {
            draft.tablespace[tableid].realtime = true;
          }
        }
      });
    }
    case "editor/data-grid/table/view": {
      const { table_id, table_view_type } = <DataGridTableViewAction>action;
      if (!table_view_type) return state;
      return produce(state, (draft) => {
        const tb = draft.tables.find((t) => t.id == table_id);
        if (!tb) return;
        tb.view = table_view_type;
      });
    }
    case "editor/data-grid/cell/select": {
      const { pk, column } = <DataGridSelectCellAction>action;
      return produce(state, (draft) => {
        draft.datagrid_selected_cell = {
          pk,
          column,
        };
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
    case "editor/data-grid/local-filter": {
      const { type, ...pref } = <DataGridLocalFilterAction>action;

      return produce(state, (draft) => {
        draft.datagrid_local_filter = {
          ...draft.datagrid_local_filter,
          ...pref,
        };
        on_datagrid_pref_change(draft, {
          view_id: tmp_view_id(draft),
        });
      });
    }
    case "editor/data-grid/loading": {
      const { isloading } = <DataTableLoadingAction>action;

      return produce(state, (draft) => {
        draft.datagrid_isloading = isloading;
      });
    }
    //
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

    //
    case "editor/form/campaign/preferences": {
      const { type, ...pref } = <FormCampaignPreferencesAction>action;
      return produce(state, (draft) => {
        draft.form.campaign = {
          ...draft.form.campaign,
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
    case "editor/form/startpage/init": {
      const { template: startpage } = <FormStartPageInitAction>action;
      return produce(state, (draft) => {
        const template_id = startpage.name;
        draft.documents["form/startpage"] = {
          template_id: template_id,
          ...initDocumentEditorState({
            editable: true,
            document: {
              root_id: "page",
              nodes: {
                ["page"]:
                  grida.program.nodes.createTemplateInstanceNodeFromTemplateDefinition(
                    "page",
                    startpage
                  ),
              },
            },
            templates: {
              [template_id]: startpage,
            },
          }),
        };
      });
    }
    case "editor/form/startpage/remove": {
      return produce(state, (draft) => {
        delete draft.documents["form/startpage"];
      });
    }
    //

    default:
      console.error("unhandled action by main editor reducer", action);
      if (process.env.NODE_ENV === "development") {
        throw new Error(
          "unhandled action by main editor reducer. see console for details"
        );
      }
      return state;
  }
}

/**
 * refresh by adding 1 to number based refresh key
 */
function nextrefreshkey(curr: number | undefined, refresh: boolean = true) {
  if (refresh) {
    return (curr ?? 0) + 1;
  }
  return curr;
}

/**
 * TODO: this should be removed after we support database views in service layer
 * get a view id of current datagrid
 *
 * @deprecated
 */
function tmp_view_id(draft: Draft<EditorState>) {
  return draft.document_id + "/" + draft.datagrid_table_id?.toString();
  //
}

/**
 * TODO: it is a good practive to do this in a hook.
 * I'm too lazy to do it now.
 *
 * @deprecated
 */
function on_datagrid_pref_change(
  draft: Draft<EditorState>,
  { view_id }: { view_id: string }
) {
  DataGridLocalPreferencesStorage.set(view_id, {
    orderby: draft.datagrid_query?.q_orderby,
    predicates: draft.datagrid_query?.q_predicates,
    masking_enabled: draft.datagrid_local_filter?.masking_enabled,
  });
}
