import { FormBlockType } from "@/types";

export type BlocksEditorAction = CreateNewBlockAction | ChangeBlockFieldAction;
export interface CreateNewBlockAction {
  type: "blocks/new";
  block: FormBlockType;
}

export interface ChangeBlockFieldAction {
  type: "blocks/field/change";
  block_id: string;
  field_id: string;
}
