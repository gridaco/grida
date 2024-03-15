import { FormBlockType } from "@/types";

export type BlocksEditorAction =
  | CreateNewBlockAction
  | SortBlockAction
  | ChangeBlockFieldAction;
export interface CreateNewBlockAction {
  type: "blocks/new";
  block: FormBlockType;
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
