import type { FormBlockType, FormFieldDefinition } from "@/types";

export interface FormEditorState {
  form_id: string;
  blocks: FormBlock[];
  fields: FormFieldDefinition[];
  responses?: any[];
  responses_pagination_rows?: number;
  focus_field_id?: string;
  is_field_edit_panel_open?: boolean;
  field_edit_panel_refresh_key?: number;
}

export interface FormBlock {
  id: string;
  form_id: string;
  form_field_id?: string | null;
  type: FormBlockType;
  data: any;
  parent_id?: string | null;
  local_index?: number | null;
}
