import type {
  Appearance,
  Customer,
  FontFamily,
  FormBlockType,
  FormFieldDefinition,
  FormInputType,
  FormPageBackgroundSchema,
  FormResponse,
  FormResponseWithFields,
  FormStyleSheetV1Schema,
  FormsPageLanguage,
  GridaXSupabase,
} from "@/types";
import type {
  EditorFlatFormBlock,
  EditorState,
  GDocTableID,
  DataViewType,
  TableXSBMainTableConnection,
} from "./state";
import type { Tokens } from "@/ast";
import type { DataQueryAction } from "../data-query";
import type { BuilderAction } from "@/builder/action";
import type { SYM_LOCALTZ } from "./symbols";

export type EditorAction =
  //
  | DatabaseAction
  //
  | FormsBlockAction
  //
  | InitAssetAction
  //
  | EditorDocumentAction
  //
  | GlobalSavingAction
  | EditorSidebarModeAction
  | EditorSelectPageAction
  | OpenFieldEditPanelAction
  | OpenRecordEditPanelAction
  | OpenCustomerDetailsPanelAction
  | OpenInsertMenuPanelAction
  //
  | FeedCustomerAction
  //
  | DataGridTableAction
  // | DataGridViewAction
  | DataGridTableViewAction
  | DataGridSelectCellAction
  | DataGridReorderColumnAction
  | DataGridDateFormatAction
  | DataGridDateTZAction
  | DataQueryAction
  | DataGridLocalFilterAction
  | DataTableLoadingAction
  | EditorThemeLangAction
  | EditorThemePoweredByBrandingAction
  | EditorThemePaletteAction
  | EditorThemeAppearanceAction
  | EditorThemeFontFamilyAction
  | EditorThemeSectionStyleAction
  | EditorThemeCustomCSSAction
  | EditorThemeBackgroundAction
  | FormCampaignPreferencesAction
  | FormEndingPreferencesAction
  | FormStartPageInitAction;

export interface InitAssetAction extends Partial<EditorState["assets"]> {
  type: "editor/assets/init";
}

export interface EditorSelectPageAction {
  type: "editor/select-page";
  page_id: string;
}

// #region block

export type FormsBlockAction =
  | FormsBlockCreateNewPendingBlockAction
  | FormsBlockResolvePendingBlockAction
  | FormsBlockDeleteBlockAction
  | FormsBlockSortBlockAction
  | FormsBlockChangeBlockFieldAction
  | FormsBlockCreateFielFromBlockdAction
  | FormsBlockBlockVHiddenAction
  | FormsBlockHtmlBlockBodyAction
  | FormsBlockImageBlockSrcAction
  | FormsBlockVideoBlockSrcAction
  | FormsBlockBlockTitleAction
  | FormsBlockBlockDescriptionAction
  | FormsBlockFocusBlockAction
  | FormsBlockBlurBlockAction;

export type FormsBlockCreateNewPendingBlockAction =
  | {
      type: "blocks/new";
      block: FormBlockType;
    }
  | {
      type: "blocks/new";
      block: "field";
      init: {
        type: FormInputType;
      };
    };

export interface FormsBlockResolvePendingBlockAction {
  type: "blocks/resolve";
  block_id: string;
  block: EditorFlatFormBlock;
}

export interface FormsBlockDeleteBlockAction {
  type: "blocks/delete";
  block_id: string;
}

export interface FormsBlockSortBlockAction {
  type: "blocks/sort";
  block_id: string;
  over_id: string;
}

export interface FormsBlockChangeBlockFieldAction {
  type: "blocks/field/change";
  block_id: string;
  field_id: string | null;
}

export interface FormsBlockCreateFielFromBlockdAction {
  type: "blocks/field/new";
  block_id: string;
}

export interface FormsBlockBlockVHiddenAction {
  type: "blocks/hidden";
  block_id: string;
  v_hidden: Tokens.ShorthandBooleanBinaryExpression;
}

export interface FormsBlockHtmlBlockBodyAction {
  type: "blocks/html/body";
  block_id: string;
  html: string;
}

export interface FormsBlockImageBlockSrcAction {
  type: "blocks/image/src";
  block_id: string;
  src: string;
}

export interface FormsBlockVideoBlockSrcAction {
  type: "blocks/video/src";
  block_id: string;
  src: string;
}

export interface FormsBlockBlockTitleAction {
  type: "blocks/title";
  block_id: string;
  title_html: string;
}

export interface FormsBlockBlockDescriptionAction {
  type: "blocks/description";
  block_id: string;
  description_html: string;
}

export interface FormsBlockFocusBlockAction {
  type: "blocks/focus";
  block_id: string;
}

export interface FormsBlockBlurBlockAction {
  type: "blocks/blur";
}

// #endregion block

// #region global ui

export type GlobalSavingAction = {
  type: "saving";
  saving: boolean;
};

export interface EditorSidebarModeAction {
  type: "editor/sidebar/mode";
  mode: "project" | "build" | "data" | "connect";
}
export interface OpenFieldEditPanelAction {
  type: "editor/panels/field-edit";
  field_id?: string;
  // true by default
  open?: boolean;
  refresh?: boolean;
}

export interface OpenCustomerDetailsPanelAction {
  type: "editor/panels/customer-details";
  customer_id?: string;
  // true by default
  open?: boolean;
}

export interface OpenInsertMenuPanelAction {
  type: "editor/panels/insert-menu";
  // true by default
  open?: boolean;
}

export interface OpenRecordEditPanelAction {
  type: "editor/panels/record-edit";
  response_id?: string;
  // true by default
  open?: boolean;
  refresh?: boolean;
}

// #endregion global ui

export interface FeedCustomerAction {
  type: "editor/customers/feed";
  data: Customer[];
}

export interface DataGridSelectCellAction {
  type: "editor/data-grid/cell/select";
  pk: string | -1; // pk value
  column: string; // column key
}

export interface DataGridReorderColumnAction {
  type: "editor/data-grid/column/reorder";
  a: string;
  b: string;
}

export interface DataGridDateFormatAction {
  type: "editor/data-grid/dateformat";
  dateformat: "datetime" | "date" | "time";
}

export interface DataGridDateTZAction {
  type: "editor/data-grid/tz";
  tz: typeof SYM_LOCALTZ | string;
}

export type DataGridTableAction = {
  type: "editor/data-grid/table";
} & (
  | {
      id: EditorState["datagrid_table_id"];
    }
  | {
      // using name as a query will swith the table within the current group
      // this is useful when can't use the id (symbol), like in select ui, where value is a string
      name: string;
    }
);

// /**
//  * @deprecated
//  */
// export type DataGridViewAction = {
//   type: "editor/data-grid/view";
// } & {
//   table_id: GDocTableID;
//   view_id: string;
// };

export type DataGridTableViewAction = {
  type: "editor/data-grid/table/view";
} & {
  table_id: GDocTableID;
  table_view_type: DataViewType;
};

export interface DataGridLocalFilterAction
  extends Partial<EditorState["datagrid_local_filter"]> {
  type: "editor/data-grid/local-filter";
}

export interface DataTableLoadingAction {
  type: "editor/data-grid/loading";
  isloading: boolean;
}

// #region database
export type DatabaseAction =
  | DatabaseTableSpaceSelectRowsAction
  | DatabaseTableSpaceCellChangeAction
  | DatabaseTableSpaceTransactionStatusAction
  | DatabaseTableSpaceDeleteSelectedRowsAction
  | DatabaseTableSpaceDeleteRowAction
  | DatabaseTableSpaceFeedProviderXSupabaseAction
  | DatabaseTableSpaceFeedAction
  | DatabaseTableSpaceFeedResponseSessionsAction
  | DatabaseTableAttributeChangeAction
  | DatabaseTableAttributeDeleteAction
  | DatabaseTableSchemaAddAction
  | DatabaseTableSchemaDeleteAction;

export interface DatabaseTableSpaceSelectRowsAction {
  type: "editor/table/space/rows/select";
  selection: ReadonlySet<string>;
}

export interface DatabaseTableSpaceCellChangeAction {
  type: "editor/table/space/cell/change";
  gdoc_table_id: GDocTableID;
  table_id: string;
  row: string;
  column: string;
  data: { value: unknown; option_id?: string | null };
}

export interface DatabaseTableSpaceTransactionStatusAction {
  type: "editor/table/space/transactions/status";
  digest: string;
  status: "queued" | "resolved";
}

export interface DatabaseTableSpaceDeleteSelectedRowsAction {
  type: "editor/table/space/rows/delete/selected";
}

export interface DatabaseTableSpaceDeleteRowAction {
  type: "editor/table/space/rows/delete";
  id: string;
}

export interface DatabaseTableSpaceFeedProviderXSupabaseAction {
  type: "editor/table/space/feed/x-supabase";
  table_id: GDocTableID;
  data: GridaXSupabase.XDataRow[];
  count: number;
}

export type DatabaseTableSpaceFeedAction = {
  type: "editor/table/space/feed";
  table_id: GDocTableID;
  data: FormResponseWithFields[];
} & (
  | {
      count: number;
      reset: true;
    }
  | { reset?: false }
);

export type DatabaseTableSpaceFeedResponseSessionsAction = {
  type: "editor/table/space/feed/sessions";
  data: FormResponse[];
} & ({ reset?: false } | { reset: true; count: number });

export interface DatabaseTableAttributeChangeAction {
  type: "editor/table/attribute/change";
  table_id: string;
  field_id: string;
  data: FormFieldDefinition;
}

export interface DatabaseTableAttributeDeleteAction {
  type: "editor/table/attribute/delete";
  table_id: string;
  field_id: string;
}

export interface DatabaseTableSchemaAddAction {
  type: "editor/table/schema/add";
  table: {
    id: string;
    name: string;
    description?: string | null;
    attributes: FormFieldDefinition[];
    x_sb_main_table_connection?: TableXSBMainTableConnection;
  };
}

export interface DatabaseTableSchemaDeleteAction {
  type: "editor/table/schema/delete";
  table_id: string;
}

// #endregion database

export interface EditorThemeLangAction {
  type: "editor/theme/lang";
  lang: FormsPageLanguage;
}

export interface EditorThemePoweredByBrandingAction {
  type: "editor/theme/powered_by_branding";
  enabled: boolean;
}

export interface EditorThemePaletteAction {
  type: "editor/theme/palette";
  palette?: FormStyleSheetV1Schema["palette"];
}

export interface EditorThemeAppearanceAction {
  type: "editor/theme/appearance";
  appearance: Appearance;
}

export interface EditorThemeFontFamilyAction {
  type: "editor/theme/font-family";
  fontFamily: FontFamily;
}

export interface EditorThemeSectionStyleAction {
  type: "editor/theme/section";
  section?: FormStyleSheetV1Schema["section"];
}

export interface EditorThemeCustomCSSAction {
  type: "editor/theme/custom-css";
  custom?: FormStyleSheetV1Schema["custom"];
}

export interface EditorThemeBackgroundAction {
  type: "editor/theme/background";
  background?: FormPageBackgroundSchema;
}

export interface FormCampaignPreferencesAction
  extends Partial<EditorState["form"]["campaign"]> {
  type: "editor/form/campaign/preferences";
}

export interface FormEndingPreferencesAction
  extends Partial<EditorState["form"]["ending"]> {
  type: "editor/form/ending/preferences";
}

export interface FormStartPageInitAction {
  type: "editor/form/startpage/init";
  startpage: {
    name: string;
    data: Record<string, any>;
  };
}

export interface EditorDocumentAction {
  type: "editor/document";
  key: "form/collection" | "form/startpage";
  action: BuilderAction;
}
