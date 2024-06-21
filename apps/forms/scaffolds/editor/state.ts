import { blockstreeflat } from "@/lib/forms/tree";
import type {
  ConnectionSupabaseJoint,
  FormBlock,
  FormBlockType,
  FormFieldDefinition,
  FormResponse,
  FormResponseField,
  FormResponseSession,
  GridaSupabase,
} from "@/types";
import { LOCALTZ } from "./symbols";

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

  return {
    connections: {
      project_id: init.project_id,
      store_id: init.connections?.store_id,
      supabase: init.connections?.supabase,
    },
    form_id: init.form_id,
    form_title: init.form_title,
    scheduling_tz: init.scheduling_tz,
    page_id: init.page_id,
    blocks: blockstreeflat(init.blocks),
    fields: init.fields,
    responses: {
      rows: [],
      fields: {},
    },
    selected_responses: new Set(),
    available_field_ids: block_available_field_ids,
    datagrid_rows: 100,
    dateformat: "datetime",
    datetz: LOCALTZ,
    datagrid_table: "response",
    datagrid_filter: {
      masking_enabled: false,
      empty_data_hidden: true,
    },
    realtime_responses_enabled: true,
    realtime_sessions_enabled: false,
  };
}

export interface DataGridFilterSettings {
  masking_enabled: boolean;
  empty_data_hidden: boolean;
}

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
  fields: FormFieldDefinition[];
  focus_field_id?: string | null;
  focus_response_id?: string;
  focus_customer_id?: string;
  focus_block_id?: string;
  available_field_ids: string[];
  responses: {
    rows: FormResponse[];
    fields: { [key: string]: FormResponseField[] };
  };
  selected_responses: Set<string>;
  sessions?: FormResponseSession[];
  datagrid_rows: number;
  datagrid_table: "response" | "session";
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
}

export interface EditorFlatFormBlock<T = FormBlockType> extends FormBlock<T> {
  id: string | DraftID;
}
