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
  GridaSupabase,
} from "@/types";
import type { EditorFlatFormBlock, EditorState } from "./state";
import type { Tokens } from "@/ast";
import { SYM_LOCALTZ } from "./symbols";
import { ZodObject } from "zod";

export type BlocksEditorAction =
  | GlobalSavingAction
  | EditorSidebarModeAction
  | CreateNewPendingBlockAction
  | ResolvePendingBlockAction
  | DeleteBlockAction
  | OpenEditFieldAction
  | SortBlockAction
  | FocusBlockAction
  | BlurBlockAction
  | InitAssetAction
  | ChangeBlockFieldAction
  | CreateFielFromBlockdAction
  | BlockVHiddenAction
  | HtmlBlockBodyAction
  | ImageBlockSrcAction
  | VideoBlockSrcAction
  | BlockTitleAction
  | BlockDescriptionAction
  | SelectResponse
  | DataGridDeleteSelectedRows
  | DeleteResponseAction
  | TableAttributeChangeAction
  | DeleteFieldAction
  | FeedResponseAction
  | OpenResponseEditAction
  | DataGridRowsAction
  | FeedResponseSessionsAction
  | DataGridTableAction
  | FeedCustomerAction
  | OpenCustomerEditAction
  | OpenInsertMenuPanelAction
  | DataGridReorderColumnAction
  | DataGridDateFormatAction
  | DataGridDateTZAction
  | DataGridFilterAction
  | DataGridOrderByAction
  | DataGridOrderByResetAction
  | DataTableRefreshAction
  | DataTableLoadingAction
  | DataGridCellChangeAction
  | FeedXSupabaseMainTableRowsAction
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
  | DocumentSelectPageAction
  | DocumentTemplateSampleDataAction
  | DocumentSelectNodeAction
  | DocumentNodeChangeTemplateAction
  | DocumentNodeChangeTextAction
  | DocumentNodeUpdateStyleAction
  | DocumentNodeUpdateAttributeAction
  | DocumentNodeUpdatePropertyAction
  | SchemaTableAddAction;

export type GlobalSavingAction = {
  type: "saving";
  saving: boolean;
};

export interface EditorSidebarModeAction {
  type: "editor/sidebar/mode";
  mode: "project" | "build" | "data" | "connect";
}

export type CreateNewPendingBlockAction =
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

export interface ResolvePendingBlockAction {
  type: "blocks/resolve";
  block_id: string;
  block: EditorFlatFormBlock;
}

export interface DeleteBlockAction {
  type: "blocks/delete";
  block_id: string;
}

export interface SortBlockAction {
  type: "blocks/sort";
  block_id: string;
  over_id: string;
}

export interface ChangeBlockFieldAction {
  type: "blocks/field/change";
  block_id: string;
  field_id: string | null;
}

export interface CreateFielFromBlockdAction {
  type: "blocks/field/new";
  block_id: string;
}

export interface BlockVHiddenAction {
  type: "blocks/hidden";
  block_id: string;
  v_hidden: Tokens.ShorthandBooleanBinaryExpression;
}

export interface HtmlBlockBodyAction {
  type: "blocks/html/body";
  block_id: string;
  html: string;
}

export interface ImageBlockSrcAction {
  type: "blocks/image/src";
  block_id: string;
  src: string;
}

export interface VideoBlockSrcAction {
  type: "blocks/video/src";
  block_id: string;
  src: string;
}

export interface BlockTitleAction {
  type: "blocks/title";
  block_id: string;
  title_html: string;
}

export interface BlockDescriptionAction {
  type: "blocks/description";
  block_id: string;
  description_html: string;
}

export interface FocusBlockAction {
  type: "blocks/focus";
  block_id: string;
}

export interface BlurBlockAction {
  type: "blocks/blur";
}

export interface InitAssetAction extends Partial<EditorState["assets"]> {
  type: "editor/assets/init";
}

export interface OpenEditFieldAction {
  type: "editor/field/edit";
  field_id?: string;
  // true by default
  open?: boolean;
  refresh?: boolean;
}

export interface TableAttributeChangeAction {
  type: "editor/table/attribute/change";
  table_id: string;
  field_id: string;
  data: FormFieldDefinition;
}

export interface DeleteFieldAction {
  type: "editor/field/delete";
  field_id: string;
}

export interface FeedResponseAction {
  type: "editor/response/feed";
  data: FormResponseWithFields[];
  reset?: boolean;
}

export interface SelectResponse {
  type: "editor/response/select";
  selection: ReadonlySet<string>;
}

export interface DeleteResponseAction {
  type: "editor/response/delete";
  id: string;
}

export interface FeedResponseSessionsAction {
  type: "editor/data/sessions/feed";
  data: FormResponse[];
  reset?: boolean;
}

export interface OpenResponseEditAction {
  type: "editor/responses/edit";
  response_id?: string;
  // true by default
  open?: boolean;
}

export interface FeedCustomerAction {
  type: "editor/customers/feed";
  data: Customer[];
}

export interface OpenCustomerEditAction {
  type: "editor/customers/edit";
  customer_id?: string;
  // true by default
  open?: boolean;
}

export interface OpenInsertMenuPanelAction {
  type: "editor/panels/insert-menu";
  // true by default
  open?: boolean;
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

export interface DataGridRowsAction {
  type: "editor/data-grid/rows";
  rows: number;
}

export interface DataGridDeleteSelectedRows {
  type: "editor/data-grid/delete/selected";
}

export interface DataGridFilterAction
  extends Partial<EditorState["datagrid_filter"]> {
  type: "editor/data-grid/filter";
}

export interface DataGridOrderByAction {
  type: "editor/data-grid/orderby";
  column_id: string;
  data: {
    ascending?: boolean;
    nullsFirst?: boolean;
  } | null;
}

export interface DataGridOrderByResetAction {
  type: "editor/data-grid/orderby/reset";
}

export interface DataTableRefreshAction {
  type: "editor/data-grid/refresh";
}

export interface DataTableLoadingAction {
  type: "editor/data-grid/loading";
  isloading: boolean;
}

export interface DataGridCellChangeAction {
  type: "editor/data-grid/cell/change";
  row: string;
  column: string;
  data: { value: any; option_id?: string | null };
}

export interface FeedXSupabaseMainTableRowsAction {
  type: "editor/x-supabase/main-table/feed";
  data: GridaSupabase.XDataRow[];
}

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
  extends Partial<EditorState["campaign"]> {
  type: "editor/form/campaign/preferences";
}

export interface FormEndingPreferencesAction
  extends Partial<EditorState["form"]["ending"]> {
  type: "editor/form/ending/preferences";
}

export interface DocumentSelectPageAction {
  type: "editor/document/select-page";
  page_id: string;
}

// TODO: consider removing this
export interface DocumentTemplateSampleDataAction {
  type: "editor/document/sampledata";
  sampledata: string;
}

export interface DocumentSelectNodeAction {
  type: "editor/document/node/select";
  node_id?: string;
  node_type?: string;
  schema?: ZodObject<any>;
  context?: any;
  default_properties?: Record<string, any>;
  default_style?: React.CSSProperties;
  default_text?: Tokens.StringValueExpression;
}

export interface DocumentNodeChangeTemplateAction {
  type: "editor/document/node/template";
  node_id: string;
  template_id: string;
}

export interface DocumentNodeChangeTextAction {
  type: "editor/document/node/text";
  node_id: string;
  text?: Tokens.StringValueExpression;
}

export interface DocumentNodeUpdateStyleAction {
  type: "editor/document/node/style";
  node_id: string;
  data: { [key: string]: any };
}

export interface DocumentNodeUpdateAttributeAction {
  type: "editor/document/node/attribute";
  node_id: string;
  data: { [key: string]: any };
}

export interface DocumentNodeUpdatePropertyAction {
  type: "editor/document/node/property";
  node_id: string;
  data: { [key: string]: any };
}

export interface SchemaTableAddAction {
  type: "editor/schema/table/add";
  table: {
    id: string;
    name: string;
    description?: string | null;
    attributes: FormFieldDefinition[];
  };
}
