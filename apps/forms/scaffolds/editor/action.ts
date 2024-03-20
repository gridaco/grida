import { FormBlockType, FormFieldDefinition, NewFormFieldInit } from "@/types";
import type { EditorFormBlock } from "./state";

export type BlocksEditorAction =
  | CreateNewPendingBlockAction
  | ResolvePendingBlockAction
  | DeleteBlockAction
  | OpenEditFieldAction
  | SortBlockAction
  | FocusFieldAction
  | ChangeBlockFieldAction
  | SaveFieldAction
  | DeleteFieldAction
  | FeedResponseAction
  | ResponseFeedRowsAction;

export interface CreateNewPendingBlockAction {
  type: "blocks/new";
  block: FormBlockType;
}

export interface ResolvePendingBlockAction {
  type: "blocks/resolve";
  block_id: string;
  block: EditorFormBlock;
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

export interface FocusFieldAction {
  type: "editor/field/focus";
  field_id: string;
}

export interface OpenEditFieldAction {
  type: "editor/field/edit";
  field_id?: string;
  // true by default
  open?: boolean;
  refresh?: boolean;
}

export interface SaveFieldAction {
  type: "editor/field/save";
  field_id: string;
  data: FormFieldDefinition;
}

export interface DeleteFieldAction {
  type: "editor/field/delete";
  field_id: string;
}

export interface FeedResponseAction {
  type: "editor/response/feed";
  data: any[];
}

export interface ResponseFeedRowsAction {
  type: "editor/responses/pagination/rows";
  max: number;
}
