import { blockstreeflat } from "@/lib/forms/tree";
import type {
  ConnectionSupabaseJoint,
  FormBlock,
  FormBlockType,
  FormFieldDefinition,
  FormFieldInit,
  FormPageBackgroundSchema,
  FormResponse,
  FormResponseField,
  FormResponseSession,
  FormStyleSheetV1Schema,
  GridaSupabase,
} from "@/types";
import { LOCALTZ } from "./symbols";
import { SupabasePostgRESTOpenApi } from "@/lib/supabase-postgrest";
import { ZodObject } from "zod";

export type DraftID = `[draft]${string}`;
export const DRAFT_ID_START_WITH = "[draft]";

export interface FormEditorInit {
  project_id: number;
  form_id: string;
  scheduling_tz?: string;
  connections?: {
    store_id?: number | null;
    supabase?: GridaSupabase.SupabaseConnectionState;
  };
  theme: FormEditorState["theme"];
  form_title: string;
  page_id: string | null;
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
    connections: {
      project_id: init.project_id,
      store_id: init.connections?.store_id,
      supabase: init.connections?.supabase,
    },
    theme: init.theme,
    form_id: init.form_id,
    form_title: init.form_title,
    tables: init.connections?.supabase?.main_supabase_table
      ? [
          {
            type: "x-supabase-main-table",
            name: init.connections.supabase.main_supabase_table.sb_table_name,
            label: init.connections.supabase.main_supabase_table.sb_table_name,
          },
        ]
      : [
          { type: "response", name: "response", label: "Responses" },
          { type: "session", name: "session", label: "Sessions" },
        ],
    scheduling_tz: init.scheduling_tz,
    page_id: init.page_id,
    blocks: blockstreeflat(init.blocks),
    document: {
      pages: ["collection", "start", "form"],
      selected_page_id: "form",
      nodes: [],
      templatedata: {},
    },
    fields: init.fields,
    responses: {
      rows: [],
      fields: {},
    },
    selected_rows: new Set(),
    available_field_ids: block_available_field_ids,
    datagrid_rows_per_page: 100,
    datagrid_table_refresh_key: 0,
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
      type: "x-supabase-main-table";
      name: string;
      label: string;
    };

export interface FormEditorState {
  connections: {
    project_id: number;
    store_id?: number | null;
    supabase?: GridaSupabase.SupabaseConnectionState;
  };
  form_id: string;
  form_title: string;
  scheduling_tz?: string;
  page_id: string | null;
  blocks: EditorFlatFormBlock[];
  document: {
    pages: string[];
    selected_page_id: string;
    nodes: any[];
    templatedata: { [key: string]: any };
    selected_node_id?: string;
    selected_node_schema?: ZodObject<any> | null;
  };
  theme: {
    palette?: FormStyleSheetV1Schema["palette"];
    fontFamily?: FormStyleSheetV1Schema["font-family"];
    customCSS?: FormStyleSheetV1Schema["custom"];
    section?: FormStyleSheetV1Schema["section"];
    background?: FormPageBackgroundSchema;
  };
  fields: FormFieldDefinition[];
  field_draft_init?: Partial<FormFieldInit> | null;
  focus_field_id?: string | null;
  focus_response_id?: string;
  focus_customer_id?: string;
  focus_block_id?: string | null;
  available_field_ids: string[];
  selected_rows: Set<string>;
  responses: {
    rows: FormResponse[];
    fields: { [key: string]: FormResponseField[] };
  };
  sessions?: FormResponseSession[];
  tables: GFTable[];
  datagrid_rows_per_page: number;
  datagrid_table: "response" | "session" | "x-supabase-main-table";
  datagrid_table_refresh_key: number;
  datagrid_isloading: boolean;
  datagrid_filter: DataGridFilterSettings;
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
