import type {
  Appearance,
  Customer,
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
  FormStyleSheetV1Schema,
  FormsPageLanguage,
  GDocumentType,
  GridaSupabase,
  OrderBy,
} from "@/types";
import { LOCALTZ } from "./symbols";
import { ZodObject } from "zod";
import { Tokens } from "@/ast";
import React from "react";

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
  theme: FormEditorState["theme"];
}

export type EditorInit =
  | FormDocumentEditorInit
  | SiteDocumentEditorInit
  | DatabaseDocumentEditorInit;

export interface SiteDocumentEditorInit extends BaseDocumentEditorInit {
  doctype: "v0_site";
}

export interface DatabaseDocumentEditorInit extends BaseDocumentEditorInit {
  doctype: "v0_schema";
  tables: ReadonlyArray<{
    id: string;
    name: string;
    description: string | null;
  }>;
}

export interface FormDocumentEditorInit extends BaseDocumentEditorInit {
  doctype: "v0_form";
  form_id: string;
  campaign: FormEditorState["campaign"];
  form_security: FormEditorState["form_security"];
  ending: FormEditorState["ending"];
  connections?: {
    store_id?: number | null;
    supabase?: GridaSupabase.SupabaseConnectionState;
  };
  form_title: string;
  blocks: EditorFlatFormBlock[];
  fields: FormFieldDefinition[];
}

export interface DataGridFilterSettings {
  localsearch?: string; // local search uses fuse.js to available data
  masking_enabled: boolean;
  empty_data_hidden: boolean;
}

type GDocTable =
  | {
      type: "response" | "session";
      name: string;
      label: string;
    }
  | {
      type: "customer";
      name: string;
      label: string;
    }
  | {
      type: "table";
      name: string;
      label: string;
    }
  | {
      type: "x-supabase-main-table" | "x-supabase-auth.users";
      name: string;
      label: string;
    };

export interface MenuItem {
  section: string;
  id: string;
  level?: number;
  label: string;
  icon: "folder" | "file" | "setting" | "table" | "chart";
  href?: string;
}

export type TableGroup =
  | "response"
  | "customer"
  | "schema"
  | "x-supabase-main-table"
  | "x-supabase-auth.users";

interface IDataGridState {
  datagrid_rows_per_page: number;
  datagrid_table:
    | "response"
    | "session"
    | "customer"
    | "x-supabase-main-table"
    | "x-supabase-auth.users"
    | string;
  datagrid_table_refresh_key: number;
  datagrid_table_row_keyword: string;
  datagrid_isloading: boolean;
  datagrid_filter: DataGridFilterSettings;
  datagrid_orderby: { [key: string]: OrderBy };
  datagrid_selected_rows: Set<string>;
}

/**
 * Utility state for entity edit dialog. id shall be processed within the correct context.
 */
interface TGlobalEditorDialogState {
  id?: string;
  open: boolean;
}

/**
 * Utility state for global data stream state.
 */
interface TGlobalDataStreamState<T> {
  realtime: boolean;
  stream?: Array<T>;
}

interface IRowEditorState {
  row_editor: TGlobalEditorDialogState;
}

interface ICustomerEditorState {
  customer_editor: TGlobalEditorDialogState;
}

interface IEditorDateContextState {
  dateformat: "date" | "time" | "datetime";
  datetz: typeof LOCALTZ | string;
}

interface IEditorSidebarState {
  sidebar: {
    mode: "project" | "build" | "data" | "connect";
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

export interface BaseDocumentEditorState
  extends IEditorGlobalSavingState,
    IEditorDateContextState,
    IEditorAssetsState,
    IEditorSidebarState,
    ICustomerEditorState,
    IRowEditorState {
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
  document: {
    pages: MenuItem[];
    selected_page_id?: string;
    nodes: any[];
    templatesample?: string;
    templatedata: {
      [key: string]: {
        text?: Tokens.StringValueExpression;
        template_id: string;
        attributes?: Omit<
          React.HtmlHTMLAttributes<HTMLDivElement>,
          "style" | "className"
        >;
        properties?: { [key: string]: Tokens.StringValueExpression };
        style?: React.CSSProperties;
      };
    };
    selected_node_id?: string;
    selected_node_type?: string;
    selected_node_schema?: ZodObject<any> | null;
    selected_node_default_properties?: Record<string, any>;
    selected_node_default_style?: React.CSSProperties;
    selected_node_default_text?: Tokens.StringValueExpression;
    selected_node_context?: Record<string, any>;
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

interface IFormResponseSessionDataStreamState {
  sessions: TGlobalDataStreamState<FormResponseSession>;
}

interface IFormBlockInsertionMenuState {
  insertmenu: TGlobalEditorDialogState;
}

export interface FormEditorState
  extends BaseDocumentEditorState,
    IFormResponseSessionDataStreamState,
    IFormBlockInsertionMenuState,
    IDataGridState {
  form_id: string;
  form_title: string;
  connections: {
    store_id?: number | null;
    supabase?: GridaSupabase.SupabaseConnectionState;
  };
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
  form_security: {
    unknown_field_handling_strategy: FormResponseUnknownFieldHandlingStrategyType;
    method: FormMethod;
  };
  ending: {
    is_redirect_after_response_uri_enabled: boolean;
    redirect_after_response_uri: string | null;
    is_ending_page_enabled: boolean;
    ending_page_template_id: EndingPageTemplateID | null;
    ending_page_i18n_overrides: EndingPageI18nOverrides | null;
  };

  blocks: EditorFlatFormBlock[];
  fields: FormFieldDefinition[];

  field_draft_init?: Partial<FormFieldInit> | null;
  focus_field_id?: string | null;
  is_field_edit_panel_open?: boolean;
  field_edit_panel_refresh_key?: number;

  available_field_ids: string[];

  focus_block_id?: string | null;

  customers?: Customer[];
  responses: {
    rows: FormResponse[];
    fields: { [key: string]: FormResponseField[] };
  };
  realtime_responses_enabled: boolean;

  tables: {
    name: string;
    group: TableGroup;
    views: GDocTable[];
  }[];

  x_supabase_main_table?: {
    schema: GridaSupabase.JSONSChema;
    // we need a single pk for editor operations
    gfpk: string | undefined;
    pks: string[];
    rows: GridaSupabase.XDataRow[];
  };
}
