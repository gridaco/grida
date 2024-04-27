import { blockstreeflat } from "@/lib/forms/tree";
import type {
  FormBlock,
  FormBlockType,
  FormFieldDefinition,
  FormResponse,
} from "@/types";

export type DraftID = `[draft]${string}`;
export const DRAFT_ID_START_WITH = "[draft]";

export interface FormEditorInit {
  project_id: number;
  form_id: string;
  connections?: {
    store_id?: number | null;
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
    },
    form_id: init.form_id,
    form_title: init.form_title,
    page_id: init.page_id,
    blocks: blockstreeflat(init.blocks),
    fields: init.fields,
    selected_responses: new Set(),
    available_field_ids: block_available_field_ids,
    responses_pagination_rows: 100,
  };
}

export interface FormEditorState {
  connections: {
    project_id: number;
    store_id?: number | null;
  };
  form_id: string;
  form_title: string;
  page_id: string | null;
  blocks: EditorFlatFormBlock[];
  fields: FormFieldDefinition[];
  focus_field_id?: string | null;
  focus_response_id?: string;
  focus_block_id?: string;
  available_field_ids: string[];
  responses?: FormResponse[];
  selected_responses: Set<string>;
  // TODO: add effect on this value to update responses
  responses_pagination_rows: number;
  is_field_edit_panel_open?: boolean;
  is_response_edit_panel_open?: boolean;
  field_edit_panel_refresh_key?: number;
}

export interface EditorFlatFormBlock<T = FormBlockType> extends FormBlock<T> {
  id: string | DraftID;
}
