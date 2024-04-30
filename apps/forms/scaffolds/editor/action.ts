import {
  FormBlockType,
  FormFieldDefinition,
  FormFieldInit,
  FormResponse,
} from "@/types";
import type { EditorFlatFormBlock } from "./state";

export type BlocksEditorAction =
  | CreateNewPendingBlockAction
  | ResolvePendingBlockAction
  | DeleteBlockAction
  | OpenEditFieldAction
  | SortBlockAction
  | FocusFieldAction
  | ChangeBlockFieldAction
  | CreateFielFromBlockdAction
  | HtmlBlockBodyAction
  | ImageBlockSrcAction
  | VideoBlockSrcAction
  | BlockTitleAction
  | BlockDescriptionAction
  | SelectResponse
  | DeleteSelectedResponsesAction
  | DeleteResponseAction
  | SaveFieldAction
  | DeleteFieldAction
  | FeedResponseAction
  | OpenResponseEditAction
  | ResponseFeedRowsAction
  | OpenCustomerEditAction;

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

export interface CreateFielFromBlockdAction {
  type: "blocks/field/new";
  block_id: string;
}

export interface HtmlBlockBodyAction {
  type: "blocks/html/body";
  block_id: string;
  html: string;
}

export interface ImageBlockSrcAction {
  type: "blocks/image/src";
  block_id: string;
  src: string;
}

export interface VideoBlockSrcAction {
  type: "blocks/video/src";
  block_id: string;
  src: string;
}

export interface BlockTitleAction {
  type: "blocks/title";
  block_id: string;
  title_html: string;
}

export interface BlockDescriptionAction {
  type: "blocks/description";
  block_id: string;
  description_html: string;
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
  data: FormResponse[];
  reset?: boolean;
}

export interface SelectResponse {
  type: "editor/response/select";
  selection: ReadonlySet<string>;
}

export interface DeleteSelectedResponsesAction {
  type: "editor/response/delete/selected";
}

export interface DeleteResponseAction {
  type: "editor/response/delete";
  id: string;
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

export interface OpenCustomerEditAction {
  type: "editor/customers/edit";
  customer_id?: string;
  // true by default
  open?: boolean;
}
