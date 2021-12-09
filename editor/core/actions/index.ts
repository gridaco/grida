export type WorkspaceAction =
  //
  HistoryAction;

export type HistoryAction =
  //
  | { type: "undo" }
  //
  | { type: "redo" }
  | Action;

export type Action =
  //
  PageAction;

export type ActionType = Action["type"];

export type PageAction = SelectPageAction;

export interface SelectPageAction {
  type: "select-page";
  page: string;
}
