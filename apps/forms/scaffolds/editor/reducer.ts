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
  DataGridRowsPerPageAction,
  DataGridPageAction,
  DataGridTableAction,
  DataGridDateFormatAction,
  DataGridDateTZAction,
  DataGridLocalFilterAction,
  DataTableRefreshAction,
  DataTableLoadingAction,
  DataGridOrderByAction,
  DataGridOrderByClearAction,
  DataGridPredicatesAddAction,
  DataGridPredicatesUpdateAction,
  DataGridPredicatesClearAction,
  DataGridPredicatesRemoveAction,
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
  DataGridTableViewAction,
} from "./action";
import { arrayMove } from "@dnd-kit/sortable";
import { EditorSymbols } from "./symbols";
import { initialDatagridState } from "./init";
import databaseRecucer from "./reducers/database.reducer";
import blockReducer from "./reducers/block.reducer";
import documentReducer from "./reducers/document.reducer";

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

    case "editor/document/select-page":
    case "editor/document/sampledata":
    case "editor/document/node/select":
    case "editor/document/node/template":
    case "editor/document/node/text":
    case "editor/document/node/style":
    case "editor/document/node/attribute":
    case "editor/document/node/property":
      return documentReducer(state, action);

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

    case "editor/data-grid/rows-per-page": {
      const { limit } = <DataGridRowsPerPageAction>action;
      return produce(state, (draft) => {
        draft.datagrid_page_limit = limit;

        // reset the pagination
        draft.datagrid_page_index = 0;
      });
    }
    case "editor/data-grid/page": {
      const { index } = <DataGridPageAction>action;
      return produce(state, (draft) => {
        draft.datagrid_page_index = index;
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
        draft.datagrid_query_estimated_count =
          datagridreset.datagrid_query_estimated_count;
        draft.datagrid_page_index = datagridreset.datagrid_page_index;
        draft.datagrid_selected_rows = datagridreset.datagrid_selected_rows;
        draft.datagrid_local_filter = datagridreset.datagrid_local_filter;
        draft.datagrid_orderby = datagridreset.datagrid_orderby;

        if (draft.doctype === "v0_form") {
          // TODO: not a best way. but for now.
          if ((draft.tablespace[tableid] as never) !== "noop") {
            draft.tablespace[tableid].realtime = true;
          }
        }
      });
    }
    case "editor/data-grid/table/view": {
      const { table_id, view_id } = <DataGridTableViewAction>action;
      return produce(state, (draft) => {
        const tb = draft.tables.find((t) => t.id == table_id);
        if (!tb) return;
        tb.view_id = view_id;
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
    // #region datagrid query
    case "editor/data-grid/local-filter": {
      const { type, ...pref } = <DataGridLocalFilterAction>action;

      return produce(state, (draft) => {
        draft.datagrid_local_filter = {
          ...draft.datagrid_local_filter,
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
    case "editor/data-grid/orderby/clear": {
      const {} = <DataGridOrderByClearAction>action;
      return produce(state, (draft) => {
        draft.datagrid_orderby = {};
      });
    }
    case "editor/data-grid/predicates/add": {
      const { predicate } = <DataGridPredicatesAddAction>action;
      return produce(state, (draft) => {
        draft.datagrid_predicates.push(predicate);
      });
    }
    case "editor/data-grid/predicates/update": {
      const { index, predicate } = <DataGridPredicatesUpdateAction>action;
      return produce(state, (draft) => {
        const prev = draft.datagrid_predicates[index];
        draft.datagrid_predicates[index] = {
          ...prev,
          ...predicate,
        };
      });
    }
    case "editor/data-grid/predicates/remove": {
      const { index } = <DataGridPredicatesRemoveAction>action;
      return produce(state, (draft) => {
        draft.datagrid_predicates.splice(index, 1);
      });
    }
    case "editor/data-grid/predicates/clear": {
      const {} = <DataGridPredicatesClearAction>action;
      return produce(state, (draft) => {
        draft.datagrid_predicates = [];
      });
    }
    // #endregion datagrid query
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

    default:
      return state;
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
