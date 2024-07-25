import { blockstreeflat } from "@/lib/forms/tree";
import type {
  ConnectionSupabaseJoint,
  Customer,
  FormBlock,
  FormBlockType,
  FormFieldDefinition,
  FormFieldInit,
  FormPageBackgroundSchema,
  FormResponse,
  FormResponseField,
  FormResponseSession,
  FormStyleSheetV1Schema,
  FormsPageLanguage,
  GridaSupabase,
  OrderBy,
} from "@/types";
import { LOCALTZ } from "./symbols";
import { SupabasePostgRESTOpenApi } from "@/lib/supabase-postgrest";
import { ZodObject } from "zod";
import { Tokens } from "@/ast";
import React from "react";

export type DraftID = `[draft]${string}`;
export const DRAFT_ID_START_WITH = "[draft]";
const ISDEV = process.env.NODE_ENV === "development";

export interface FormEditorInit {
  organization: {
    name: string;
    id: number;
  };
  project: {
    name: string;
    id: number;
  };
  form_id: string;
  scheduling_tz?: string;
  connections?: {
    store_id?: number | null;
    supabase?: GridaSupabase.SupabaseConnectionState;
  };
  theme: FormEditorState["theme"];
  form_title: string;
  form_document_id: string | null;
  blocks: EditorFlatFormBlock[];
  fields: FormFieldDefinition[];
}

export function initialFormEditorState(init: FormEditorInit): FormEditorState {
  // prepare initial available_field_ids
  const field_ids = init.fields.map((f) => f.id);
  const block_referenced_field_ids = init.blocks
    .map((b) => b.form_field_id)
    .filter((id) => id !== null) as string[];
  const block_available_field_ids = field_ids.filter(
    (id) => !block_referenced_field_ids.includes(id)
  );

  const is_main_table_supabase =
    !!init.connections?.supabase?.main_supabase_table;

  return {
    project: init.project,
    organization: init.organization,
    connections: {
      store_id: init.connections?.store_id,
      supabase: init.connections?.supabase,
    },
    theme: init.theme,
    form_id: init.form_id,
    form_title: init.form_title,
    tables: init.connections?.supabase?.main_supabase_table
      ? [
          {
            name: init.connections.supabase.main_supabase_table.sb_table_name,
            group: "x-supabase-main-table",
            views: [
              {
                type: "x-supabase-main-table",
                name: init.connections.supabase.main_supabase_table
                  .sb_table_name,
                label:
                  init.connections.supabase.main_supabase_table.sb_table_name,
              },
            ],
          },
          {
            name: "auth.users",
            group: "x-supabase-auth.users",
            views: [
              {
                type: "x-supabase-auth.users",
                name: "auth.users",
                label: "auth.users",
              },
            ],
          },
        ]
      : [
          {
            name: "Responses",
            group: "response",
            views: [
              { type: "response", name: "response", label: "Responses" },
              { type: "session", name: "session", label: "Sessions" },
            ],
          },
          {
            name: "Customers",
            group: "customer",
            views: [{ type: "customer", name: "customer", label: "Customers" }],
          },
        ],
    scheduling_tz: init.scheduling_tz,
    form_document_id: init.form_document_id,
    blocks: blockstreeflat(init.blocks),
    document: {
      pages: ISDEV
        ? ["collection", "start", "form", "ending"]
        : ["form", "ending"],
      selected_page_id: "form",
      nodes: [],
      templatesample: "formcollection_sample_001_the_bundle",
      templatedata: {},
    },
    fields: init.fields,
    assets: {
      backgrounds: [],
    },
    customers: undefined,
    responses: {
      rows: [],
      fields: {},
    },
    selected_rows: new Set(),
    available_field_ids: block_available_field_ids,
    datagrid_rows_per_page: 100,
    datagrid_table_refresh_key: 0,
    datagrid_table_row_keyword: "row",
    datagrid_isloading: false,
    dateformat: "datetime",
    datetz: LOCALTZ,
    datagrid_table: is_main_table_supabase
      ? "x-supabase-main-table"
      : "response",
    datagrid_filter: {
      masking_enabled: false,
      empty_data_hidden: true,
    },
    datagrid_orderby: {},
    realtime_responses_enabled: true,
    realtime_sessions_enabled: false,
    x_supabase_main_table: init.connections?.supabase
      ? xsbmtinit(init.connections.supabase)
      : undefined,
  };
}

function xsbmtinit(conn?: GridaSupabase.SupabaseConnectionState) {
  // TODO: need inspection - will supbaseconn present even when main table is not present?
  // if yes, we need to adjust the state to be nullable
  if (!conn) return undefined;
  if (!conn.main_supabase_table) return undefined;

  const parsed = conn.main_supabase_table.sb_table_schema
    ? SupabasePostgRESTOpenApi.parse_supabase_postgrest_schema_definition(
        conn.main_supabase_table?.sb_table_schema
      )
    : undefined;

  return {
    schema: conn.main_supabase_table.sb_table_schema,
    pks: parsed?.pks || [],
    gfpk: (parsed?.pks?.length || 0) > 0 ? parsed?.pks[0] : undefined,
    rows: [],
  };
}

export interface DataGridFilterSettings {
  localsearch?: string; // local search uses fuse.js to available data
  masking_enabled: boolean;
  empty_data_hidden: boolean;
}

type GFTable =
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
      type: "x-supabase-main-table" | "x-supabase-auth.users";
      name: string;
      label: string;
    };

export interface FormEditorState {
  organization: {
    name: string;
    id: number;
  };
  project: {
    name: string;
    id: number;
  };
  connections: {
    store_id?: number | null;
    supabase?: GridaSupabase.SupabaseConnectionState;
  };
  form_id: string;
  form_title: string;
  scheduling_tz?: string;
  form_document_id: string | null;
  blocks: EditorFlatFormBlock[];
  document: {
    pages: string[];
    selected_page_id: string;
    nodes: any[];
    templatesample: string;
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
  fields: FormFieldDefinition[];
  field_draft_init?: Partial<FormFieldInit> | null;
  focus_field_id?: string | null;
  focus_response_id?: string;
  focus_customer_id?: string;
  focus_block_id?: string | null;
  available_field_ids: string[];
  theme: {
    is_powered_by_branding_enabled: boolean;
    lang: FormsPageLanguage;
    palette?: FormStyleSheetV1Schema["palette"];
    fontFamily?: FormStyleSheetV1Schema["font-family"];
    customCSS?: FormStyleSheetV1Schema["custom"];
    section?: FormStyleSheetV1Schema["section"];
    background?: FormPageBackgroundSchema;
  };
  assets: {
    backgrounds: {
      name: string;
      title: string;
      embed: string;
      preview: [string] | [string, string];
    }[];
  };
  customers?: Customer[];
  selected_rows: Set<string>;
  responses: {
    rows: FormResponse[];
    fields: { [key: string]: FormResponseField[] };
  };
  sessions?: FormResponseSession[];
  tables: {
    name: string;
    group:
      | "response"
      | "customer"
      | "x-supabase-main-table"
      | "x-supabase-auth.users";
    views: GFTable[];
  }[];
  datagrid_rows_per_page: number;
  datagrid_table:
    | "response"
    | "session"
    | "customer"
    | "x-supabase-main-table"
    | "x-supabase-auth.users";
  datagrid_table_refresh_key: number;
  datagrid_table_row_keyword: string;
  datagrid_isloading: boolean;
  datagrid_filter: DataGridFilterSettings;
  datagrid_orderby: { [key: string]: OrderBy };
  realtime_sessions_enabled: boolean;
  realtime_responses_enabled: boolean;
  is_field_edit_panel_open?: boolean;
  is_response_edit_panel_open?: boolean;
  is_customer_edit_panel_open?: boolean;
  is_block_edit_panel_open?: boolean;
  field_edit_panel_refresh_key?: number;
  dateformat: "date" | "time" | "datetime";
  datetz: typeof LOCALTZ | string;
  x_supabase_main_table?: {
    schema: GridaSupabase.JSONSChema;
    // we need a single pk for editor operations
    gfpk: string | undefined;
    pks: string[];
    rows: GridaSupabase.XDataRow[];
  };
}

export interface EditorFlatFormBlock<T = FormBlockType> extends FormBlock<T> {
  id: string | DraftID;
}
