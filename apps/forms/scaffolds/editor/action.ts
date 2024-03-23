import { FormBlockType, FormFieldDefinition, NewFormFieldInit } from "@/types";
import type { EditorFlatFormBlock } from "./state";

export type BlocksEditorAction =
  | CreateNewPendingBlockAction
  | ResolvePendingBlockAction
  | DeleteBlockAction
  | OpenEditFieldAction
  | SortBlockAction
  | FocusFieldAction
  | ChangeBlockFieldAction
  | SelectResponse
  | DeleteSelectedResponsesAction
  | SaveFieldAction
  | DeleteFieldAction
  | FeedResponseAction
  | OpenResponseEditAction
  | ResponseFeedRowsAction;

export interface CreateNewPendingBlockAction {
  type: "blocks/new";
  block: FormBlockType;
}

export interface ResolvePendingBlockAction {
  type: "blocks/resolve";
  block_id: string;
  block: EditorFlatFormBlock;
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

export interface SelectResponse {
  type: "editor/response/select";
  selection: ReadonlySet<string>;
}

export interface DeleteSelectedResponsesAction {
  type: "editor/response/delete/selected";
}

export interface ResponseFeedRowsAction {
  type: "editor/responses/pagination/rows";
  max: number;
}

export interface OpenResponseEditAction {
  type: "editor/responses/edit";
  response_id?: string;
  // true by default
  open?: boolean;
}
