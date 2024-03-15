import { FormBlockType } from "@/types";

export type BlocksEditorAction =
  | CreateNewBlockAction
  | DeleteBlockAction
  | OpenEditFieldAction
  | SortBlockAction
  | ChangeBlockFieldAction;
export interface CreateNewBlockAction {
  type: "blocks/new";
  block: FormBlockType;
}

export interface DeleteBlockAction {
  type: "blocks/delete";
  block_id: string;
}

export interface SortBlockAction {
  type: "blocks/sort";
  block_id: string;
  over_id: string;
}

export interface ChangeBlockFieldAction {
  type: "blocks/field/change";
  block_id: string;
  field_id: string;
}

export interface OpenEditFieldAction {
  type: "editor/field/edit";
  field_id?: string;
  // true by default
  open?: boolean;
}
