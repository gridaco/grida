export type WorkspaceAction =
  //
  | HistoryAction
  //
  | HighlightLayerAction;

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
  | SelectNodeAction
  //
  | HighlightLayerAction
  //
  | CodeEditorAction;

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

export interface HighlightLayerAction {
  type: "highlight-layer";
  id: string;
}

export type CodeEditorAction = CodeEditorEditComponentCodeAction;

export interface CodeEditorEditComponentCodeAction {
  type: "code-editor-edit-component-code";
  id: string;
  framework: string;
  componentName: string;
  raw: string;
}
