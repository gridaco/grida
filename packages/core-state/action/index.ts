import { PageAction } from "../page/page-action";

export type WorkspaceAction =
  | [type: "newFile"]
  //
  | HistoryAction;

export type HistoryAction =
  //
  | [type: "undo"]
  //
  | [type: "redo"]
  | Action;

export type Action =
  //
  PageAction;
