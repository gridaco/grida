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
  | PageAction
  //
  | SelectNodeAction;

export type ActionType = Action["type"];

export type HierarchyAction = SelectNodeAction;
export interface SelectNodeAction {
  type: "select-node";
  node: string;
}

export type PageAction = SelectPageAction;

export interface SelectPageAction {
  type: "select-page";
  page: string;
}
