import type { FormBlockType, FormFieldDefinition } from "@/types";

export interface BlocksEditorState {
  form_id: string;
  blocks: FormBlock[];
  fields: FormFieldDefinition[];
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
