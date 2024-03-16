import type { FormBlockType, FormFieldDefinition } from "@/types";

export interface BlocksEditorState {
  form_id: string;
  blocks: FormBlock[];
  fields: FormFieldDefinition[];
  editing_field_id?: string;
  is_field_edit_panel_open?: boolean;
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
