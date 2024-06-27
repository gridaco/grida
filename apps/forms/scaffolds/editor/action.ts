import {
  FormBlockType,
  FormFieldDefinition,
  FormFieldInit,
  FormResponse,
  FormResponseField,
  FormResponseWithFields,
  GridaSupabase,
} from "@/types";
import type { EditorFlatFormBlock, FormEditorState } from "./state";
import type { JSONConditionExpression } from "@/types/logic";
import { LOCALTZ } from "./symbols";

export type BlocksEditorAction =
  | CreateNewPendingBlockAction
  | ResolvePendingBlockAction
  | DeleteBlockAction
  | OpenEditFieldAction
  | SortBlockAction
  | FocusBlockAction
  | FocusFieldAction
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
  | SaveFieldAction
  | DeleteFieldAction
  | FeedResponseAction
  | OpenResponseEditAction
  | DataGridRowsAction
  | FeedResponseSessionsAction
  | DataGridTableAction
  | OpenCustomerEditAction
  | OpenBlockEditPanelAction
  | DataGridReorderColumnAction
  | DataGridDateFormatAction
  | DataGridDateTZAction
  | DataGridFilterAction
  | DataTableRefreshAction
  | DataTableLoadingAction
  | DataGridCellChangeAction
  | FeedXSupabaseMainTableRowsAction;

export interface CreateNewPendingBlockAction {
  type: "blocks/new";
  block: FormBlockType;
}

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
  v_hidden: JSONConditionExpression;
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

export interface FocusFieldAction {
  type: "editor/field/focus";
  field_id: string;
}

export interface OpenEditFieldAction {
  type: "editor/field/edit";
  field_id?: string;
  // true by default
  open?: boolean;
  refresh?: boolean;
}

export interface SaveFieldAction {
  type: "editor/field/save";
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

export interface OpenCustomerEditAction {
  type: "editor/customers/edit";
  customer_id?: string;
  // true by default
  open?: boolean;
}

export interface OpenBlockEditPanelAction {
  type: "editor/panels/block-edit";
  block_id?: string;
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
  tz: typeof LOCALTZ | string;
}

export interface DataGridTableAction {
  type: "editor/data-grid/table";
  table: "response" | "session" | "x-supabase-main-table";
}

export interface DataGridRowsAction {
  type: "editor/data-grid/rows";
  rows: number;
}

export interface DataGridDeleteSelectedRows {
  type: "editor/data-grid/delete/selected";
}

export interface DataGridFilterAction
  extends Partial<FormEditorState["datagrid_filter"]> {
  type: "editor/data-grid/filter";
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
