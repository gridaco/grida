import type {
  Appearance,
  AttributeDefinition,
  CanvasDocumentSnapshotSchema,
  EndingPageI18nOverrides,
  EndingPageTemplateID,
  FontFamily,
  FormBlock,
  FormBlockType,
  FormFieldDefinition,
  FormFieldInit,
  FormMethod,
  FormPageBackgroundSchema,
  FormResponse,
  FormResponseField,
  FormResponseSession,
  FormResponseUnknownFieldHandlingStrategyType,
  FormStartPageSchema,
  FormStyleSheetV1Schema,
  FormsPageLanguage,
  GDocumentType,
  GridaXSupabase,
} from "@/types";
import type { ResourceTypeIconName } from "@/components/resource-type-icon";
import type { Data } from "@/lib/data";
import type { IDocumentEditorState } from "@/grida-react-canvas/state";
import type { DataGridLocalFilter } from "../data-table";
import type { MenuGroup, MenuItem } from "./menu";
import type { Platform } from "@/lib/platform";
import { EditorSymbols } from "./symbols";
import { DataFormat } from "../data-format";

export type GDocEditorRouteParams = {
  org: string;
  proj: string;
  id: string;
};

export type DraftID = `[draft]${string}`;
export const DRAFT_ID_START_WITH = "[draft]";
const ISDEV = process.env.NODE_ENV === "development";

export interface EditorFlatFormBlock<T = FormBlockType> extends FormBlock<T> {
  id: string | DraftID;
}

export interface BaseDocumentEditorInit {
  organization: {
    name: string;
    id: number;
  };
  project: {
    name: string;
    id: number;
  };
  document_id: string;
  document_title: string;
  doctype: GDocumentType;
  theme: EditorState["theme"];
  user_id: string;
}

export type EditorInit =
  | FormDocumentEditorInit
  | SiteDocumentEditorInit
  | SchemaDocumentEditorInit
  | BucketDocumentEditorInit
  | CanvasDocumentEditorInit;

export interface SiteDocumentEditorInit extends BaseDocumentEditorInit {
  doctype: "v0_site";
}

export interface CanvasDocumentEditorInit extends BaseDocumentEditorInit {
  doctype: "v0_canvas";
  document: CanvasDocumentSnapshotSchema;
}

export interface SchemaDocumentTableInit {
  id: string;
  name: string;
  description: string | null;
  attributes: Array<FormFieldDefinition>;
  x_sb_main_table_connection?: TableXSBMainTableConnection;
}

export interface SchemaDocumentEditorInit extends BaseDocumentEditorInit {
  doctype: "v0_schema";
  supabase_project: GridaXSupabase.SupabaseProject | null;
  tables: ReadonlyArray<SchemaDocumentTableInit>;
}

export interface BucketDocumentEditorInit extends BaseDocumentEditorInit {
  doctype: "v0_bucket";
}

export interface FormDocumentEditorInit extends BaseDocumentEditorInit {
  doctype: "v0_form";
  form_id: string;
  campaign: EditorState["form"]["campaign"];
  form_security: EditorState["form"]["form_security"];

  /**
   * the start document as-is (the typing is ignored - this should be assured before being actually passed under the provider)
   *
   * TODO: review me - only need single scene
   */
  start: FormStartPageSchema | unknown;
  ending: EditorState["form"]["ending"];
  connections?: {
    store_id?: number | null;
    supabase?: GridaXSupabase.XSupabaseMainTableConnectionState;
  };
  form_title: string;
  blocks: EditorFlatFormBlock[];
  fields: FormFieldDefinition[];
}

type GDocTableBase = {
  /**
   * keyword indicating the row, singular form (will be made plural in the UI)
   * e.g. "row" "user" "session" "customer"
   */
  row_keyword: string;
  name: string;
  description: string | null;
  icon: ResourceTypeIconName;
  readonly: boolean;
  rules: {
    delete_restricted: boolean;
  };
  label: string;
  // views: Array<TableView>;
  // view_id?: string;
  view: DataViewType;
};

export type DataViewType = "table" | "list" | "chart" | "gallery";

/**
 * Data view model
 *
 * Like css, this type contains all properties that can be used to style a view.
 * This is to make saving the user preferences easier.
 *
 * It depends on the implementation how each property is used. Irrelevant properties shall be ignored.
 */
export interface IDataView {
  type: DataViewType;
}

// export type IDataChartView = Pick<IDataView, "type">;

export type GDocTable = GDocTableBase &
  (
    | {
        id: typeof EditorSymbols.Table.SYM_GRIDA_FORMS_RESPONSE_TABLE_ID;
        provider: "grida";
      }
    | {
        id: typeof EditorSymbols.Table.SYM_GRIDA_FORMS_SESSION_TABLE_ID;
        provider: "custom";
      }
    | {
        id: typeof EditorSymbols.Table.SYM_GRIDA_CUSTOMER_TABLE_ID;
        provider: "custom";
      }
    | GDocFormsXSBTable
    | {
        id: typeof EditorSymbols.Table.SYM_GRIDA_X_SUPABASE_AUTH_USERS_TABLE_ID;
        provider: "x-supabase-auth";
      }
    | GDocSchemaTable
  );

export type GDocFormsXSBTable = {
  id: typeof EditorSymbols.Table.SYM_GRIDA_FORMS_X_SUPABASE_MAIN_TABLE_ID;
  provider: "x-supabase";
  x_sb_main_table_connection: TableXSBMainTableConnection;
} & GDocTableBase;

export type GDocSchemaTableProviderGrida = {
  id: string;
  provider: "grida";
  attributes: Array<AttributeDefinition>;
  readonly: false;
} & GDocTableBase;

export type GDocSchemaTableProviderXSupabase = {
  id: string;
  provider: "x-supabase";
  attributes: Array<AttributeDefinition>;
  x_sb_main_table_connection: TableXSBMainTableConnection;
} & GDocTableBase;

export type GDocSchemaTable =
  | GDocSchemaTableProviderGrida
  | GDocSchemaTableProviderXSupabase;

export type GDocTableID = GDocTable["id"];

/**
 * this connection indicates the grida table is connected to a x-supabase table
 */
export type TableXSBMainTableConnection = {
  supabase_project_id: number;
  sb_schema_name: string;
  sb_table_name: string;
  sb_table_id: number;
  // we need a single pk for editor operations - this may not always be available since pg table can have no pk
  pk: string | undefined;
  pks: string[];
  /**
   * @deprecated use {@link TableXSBMainTableConnection.definition} instead
   */
  sb_table_schema: GridaXSupabase.JSONSChema;
  definition: Data.Relation.TableDefinition;
  sb_postgrest_methods: GridaXSupabase.XSBPostgrestMethod[];
};

export type TableMenuItemData = {
  readonly: boolean;
  rules: {
    delete_restricted: boolean;
  };
};

export type TableMenuItem = MenuItem<{
  id: GDocTableID;
  data: TableMenuItemData;
}>;

export type TableType =
  | "response"
  | "customer"
  | "schema"
  | "x-supabase-auth.users";

export type DataGridCellPositionQuery = {
  pk: string | -1;
  column: string;
};
export interface IDataGridState {
  /**
   * @global current data grid query state
   */
  datagrid_query: Data.Relation.QueryState | null;

  /**
   * @global total rows count, also used for pagination (uses 'estimated' for counting - for performance reasons)
   */
  datagrid_query_estimated_count: number | null;
  datagrid_table_id: GDocTableID | null;
  datagrid_isloading: boolean;
  datagrid_local_filter: DataGridLocalFilter;
  datagrid_selected_rows: Set<string>;
  datagrid_selected_cell: DataGridCellPositionQuery | null;
}

/**
 * Utility state for entity edit dialog. id shall be processed within the correct context.
 */
interface TGlobalEditorDialogState<T = never> {
  id?: string;
  refreshkey?: number;
  open: boolean;
  data?: T;
}

export type TVirtualRowData<T> = { [attributekey: string]: T };
export type TVirtualRow<T = Record<string, any>, M = Record<string, any>> = {
  id: string;
  data: TVirtualRowData<T>;
  meta: M;
};

/**
 * Utility state for global data stream state.
 */
export type ITablespace<T> = {
  provider: TTablespace["provider"];
  readonly: boolean;
  realtime: boolean;
  stream?: Array<T>;
};

export type TablespaceTransaction = {
  digest: string;
  timestamp: number;
  user: "system" | "user";
  operation: "update";
  schema_table_id: string;
  row: string;
  column: string;
  data: Record<string, unknown>;
  status: "pending" | "queued";
};

export type TTablespace =
  | TCustomDataTablespace<any>
  | TXSupabaseDataTablespace
  | TGridaDataTablespace;

type TCustomDataTablespace<T> = {
  provider: "custom";
  realtime: boolean;
  stream?: Array<T>;
} & (
  | {
      readonly: false;
    }
  | { readonly: true }
);

export type TXSupabaseDataTablespace = {
  provider: "x-supabase";
  readonly: boolean;
  realtime: false;
  stream?: Array<GridaXSupabase.XDataRow>;
};

export type TGridaDataTablespace = {
  provider: "grida";
  readonly: boolean;
  realtime: boolean;
  stream?: Array<GridaSchemaTableVirtualRow>;
};

export type GridaSchemaTableVirtualRow = TVirtualRow<
  FormResponseField,
  FormResponse
>;

interface IRowEditorState {
  row_editor: TGlobalEditorDialogState;
}

interface ICustomerEditorState {
  customer_editor: TGlobalEditorDialogState;
}

interface IEditorDateContextState {
  dateformat: DataFormat.DateFormat;
  datetz: DataFormat.DateTZ;
}

interface IEditorSidebarState {
  sidebar: {
    mode: "project" | "build" | "data" | "connect";
    mode_build: {
      disabled: boolean;
    };
    mode_data: {
      disabled: boolean;
      tables?: TableMenuItem[];
      menus?: MenuGroup<{ id: string }>[];
    };
    mode_connect: {
      disabled: boolean;
    };
  };
}

interface IEditorGlobalSavingState {
  saving: boolean;
}

interface IEditorAssetsState {
  assets: {
    backgrounds: {
      name: string;
      title: string;
      embed: string;
      preview: [string] | [string, string];
    }[];
  };
}

interface IInsertionMenuState {
  insertmenu: TGlobalEditorDialogState;
}

export type NodePos = { type: "cell"; pos: DataGridCellPositionQuery };

interface IEditorPagesState {
  pages: MenuGroup<{ id: string }>[];
  selected_page_id?: "form" | "form/startpage" | "site" | (string & {});
}

export type SchemaMayVaryDocument<S> = {
  /**
   * the schema version from the server
   */
  __schema_version: string;
} & (
  | {
      /**
       * if the schema is validated (the version is correct)
       */
      __schema_valid: true;

      state: S;
    }
  | {
      /**
       * if the schema is validated (the version is correct)
       */
      __schema_valid: false;

      state: null;
    }
);

export interface BaseDocumentEditorState
  extends IEditorGlobalSavingState,
    IEditorDateContextState,
    IEditorAssetsState,
    IEditorPagesState,
    IInsertionMenuState,
    IFieldEditorState,
    ICustomerEditorState,
    IRowEditorState {
  user_id: string;
  cursor_id: string;
  basepath: string;
  organization: {
    name: string;
    id: number;
  };
  project: {
    name: string;
    id: number;
  };
  document_id: string;
  document_title: string;
  doctype: GDocumentType;
  documents: {
    ["site"]?: SchemaMayVaryDocument<IDocumentEditorState>;
    ["canvas"]?: SchemaMayVaryDocument<IDocumentEditorState>;
    ["form/startpage"]?:
      | SchemaMayVaryDocument<IDocumentEditorState & { template_id: string }>
      | undefined;
    // [key: string]: ITemplateEditorState;
  };
  theme: {
    is_powered_by_branding_enabled: boolean;
    lang: FormsPageLanguage;
    appearance: Appearance;
    palette?: FormStyleSheetV1Schema["palette"];
    fontFamily: FontFamily;
    customCSS?: FormStyleSheetV1Schema["custom"];
    section?: FormStyleSheetV1Schema["section"];
    background?: FormPageBackgroundSchema;
  };
}

interface IFieldEditorState {
  field_editor: TGlobalEditorDialogState<{
    draft: Partial<FormFieldInit> | null;
  }>;
}

interface IConnectionsState {
  supabase_project: GridaXSupabase.SupabaseProject | null;
  connections: {
    store_id?: number | null;
    /**
     * @deprecated drop me use supabase_project instead
     */
    supabase?: GridaXSupabase.XSupabaseMainTableConnectionState;
  };
}

/**
 * A utility type that determines the stream type for a table based on its schema.
 *
 * - If the table is a `GDocSchemaTable` and has an `x_sb_main_table_connection`,
 *   the stream type will be `GridaXSupabase.XDataRow`.
 * - If the table is a `GDocSchemaTable` but does not have an `x_sb_main_table_connection`,
 *   the stream type will default to `GridaSchemaTableVirtualRow`.
 * - For any other table type, the stream type will be `GridaSchemaTableVirtualRow`.
 *
 * @template T The table type, which extends from `GDocTableBase`.
 *
 * @example
 * // For a GDocSchemaTable with x_sb_main_table_connection:
 * type StreamType = TablespaceSchemaTableStreamType<GDocSchemaTableWithConnection>;
 * // StreamType will be GridaXSupabase.XDataRow
 *
 * @example
 * // For a GDocSchemaTable without x_sb_main_table_connection:
 * type StreamType = TablespaceSchemaTableStreamType<GDocSchemaTableWithoutConnection>;
 * // StreamType will be GridaSchemaTableVirtualRow
 *
 * @example
 * // For a non-schema table (e.g., GDocFormsTable):
 * type StreamType = TablespaceSchemaTableStreamType<GDocFormsTable>;
 * // StreamType will default to GridaSchemaTableVirtualRow
 */
export type TablespaceSchemaTableStreamType<T extends GDocTableBase> =
  T extends GDocSchemaTable
    ? T["provider"] extends "x-supabase"
      ? GridaXSupabase.XDataRow
      : GridaSchemaTableVirtualRow
    : GridaSchemaTableVirtualRow;

interface ITablespaceEditorState {
  tables: Array<GDocTable>;
  /**
   * you can find the records for the table data here
   *
   * `{[table_id]: { stream: [{ id, data: {...}, meta }]} }`
   */
  tablespace: {
    [EditorSymbols.Table
      .SYM_GRIDA_FORMS_RESPONSE_TABLE_ID]: TGridaDataTablespace;
    [EditorSymbols.Table
      .SYM_GRIDA_FORMS_SESSION_TABLE_ID]: TCustomDataTablespace<FormResponseSession>;
    [EditorSymbols.Table
      .SYM_GRIDA_CUSTOMER_TABLE_ID]: TCustomDataTablespace<Platform.Customer.CustomerWithTags>;
    [EditorSymbols.Table
      .SYM_GRIDA_FORMS_X_SUPABASE_MAIN_TABLE_ID]: TXSupabaseDataTablespace;
    [EditorSymbols.Table.SYM_GRIDA_X_SUPABASE_AUTH_USERS_TABLE_ID]: never;
  } & {
    [table_id: string]: TXSupabaseDataTablespace | TGridaDataTablespace;
    // [T in GDocTable as Extract<T["id"], string>]: ITablespace<
    //   TablespaceSchemaTableStreamType<T>
    // >;
  };

  transactions: Array<TablespaceTransaction>;
}

export interface FormEditorState
  extends BaseDocumentEditorState,
    IConnectionsState,
    IEditorSidebarState,
    ITablespaceEditorState,
    IDataGridState {
  blocks: EditorFlatFormBlock[];

  form: {
    form_id: string;
    form_title: string;
    fields: FormFieldDefinition[];
    available_field_ids: string[];
    campaign: {
      max_form_responses_by_customer: number | null;
      is_max_form_responses_by_customer_enabled: boolean;
      max_form_responses_in_total: number | null;
      is_max_form_responses_in_total_enabled: boolean;
      is_force_closed: boolean;
      is_scheduling_enabled: boolean;
      scheduling_open_at: string | null;
      scheduling_close_at: string | null;
      scheduling_tz?: string;
    };
    ending: {
      is_redirect_after_response_uri_enabled: boolean;
      redirect_after_response_uri: string | null;
      is_ending_page_enabled: boolean;
      ending_page_template_id: EndingPageTemplateID | null;
      ending_page_i18n_overrides: EndingPageI18nOverrides | null;
    };
    form_security: {
      unknown_field_handling_strategy: FormResponseUnknownFieldHandlingStrategyType;
      method: FormMethod;
    };
  };

  focus_block_id?: string | null;
}

export type EditorState = FormEditorState;
