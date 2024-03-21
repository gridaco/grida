import type { FormBlockType, FormFieldDefinition } from "@/types";

export type DraftID = `[draft]${string}`;
export const DRAFT_ID_START_WITH = "[draft]";

export interface FormEditorInit {
  form_id: string;
  blocks: EditorFormBlock[];
  fields: FormFieldDefinition[];
}

export function initialFormEditorState(init: FormEditorInit): FormEditorState {
  // ensure initial blocks are sorted by local_index
  const sorted_blocks = Array.from(init.blocks).sort((a, b) => {
    return a.local_index - b.local_index;
  });

  // prepare initial available_field_ids
  const field_ids = init.fields.map((f) => f.id);
  const block_referenced_field_ids = init.blocks
    .map((b) => b.form_field_id)
    .filter((id) => id !== null) as string[];
  const block_available_field_ids = field_ids.filter(
    (id) => !block_referenced_field_ids.includes(id)
  );

  return {
    form_id: init.form_id,
    blocks: sorted_blocks,
    fields: init.fields,
    selected_responses: new Set(),
    available_field_ids: block_available_field_ids,
    responses_pagination_rows: 100,
  };
}

export interface FormEditorState {
  form_id: string;
  blocks: EditorFormBlock[];
  fields: FormFieldDefinition[];
  available_field_ids: string[];
  responses?: any[];
  selected_responses: Set<string>;
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
