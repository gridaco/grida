import type { FormBlockType, FormFieldDefinition } from "@/types";

export type DraftID = `[draft]${string}`;
export const DRAFT_ID_START_WITH = "[draft]";

export interface FormEditorInit {
  form_id: string;
  blocks: EditorFormBlock[];
  fields: FormFieldDefinition[];
}

export function initialFormEditorState(init: FormEditorInit): FormEditorState {
  return {
    form_id: init.form_id,
    // ensure initial blocks are sorted by local_index
    blocks: Array.from(init.blocks).sort((a, b) => {
      return a.local_index - b.local_index;
    }),
    fields: init.fields,
    available_field_ids: init.fields.map((f) => f.id),
    responses_pagination_rows: 100,
  };
}

export interface FormEditorState {
  form_id: string;
  blocks: EditorFormBlock[];
  fields: FormFieldDefinition[];
  available_field_ids: string[];
  responses?: any[];
  responses_pagination_rows: number;
  focus_field_id?: string;
  is_field_edit_panel_open?: boolean;
  field_edit_panel_refresh_key?: number;
}

export interface EditorFormBlock {
  id: string | DraftID;
  form_id: string;
  form_field_id?: string | null;
  type: FormBlockType;
  data: any;
  parent_id?: string | null;
  local_index: number;
}
