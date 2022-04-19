import type { FrameworkConfig } from "@designto/config";
import type { EditorState, ScenePreviewData } from "core/states";

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
  | PageAction
  | SelectNodeAction
  | HighlightLayerAction
  | CanvasEditAction
  | CanvasModeAction
  | PreviewAction
  | CodeEditorAction;

export type ActionType = Action["type"];

export type HierarchyAction = SelectNodeAction;
export interface SelectNodeAction {
  type: "select-node";
  node: string | string[];
}

export type CanvasEditAction = TranslateNodeAction;

export interface TranslateNodeAction {
  type: "node-transform-translate";
  translate: [number, number];
  node: string[];
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

type CanvasModeAction = CanvasModeSwitchAction | CanvasModeGobackAction;
export interface CanvasModeSwitchAction {
  type: "canvas-mode-switch";
  mode: EditorState["canvasMode"];
}

export interface CanvasModeGobackAction {
  type: "canvas-mode-goback";
  fallback?: EditorState["canvasMode"];
}

export type PreviewAction = PreviewSetAction | PreviewBuildingStateUpdateAction;

export interface PreviewSetAction {
  type: "preview-set";
  data: ScenePreviewData;
}

export interface PreviewBuildingStateUpdateAction {
  type: "preview-update-building-state";
  isBuilding: boolean;
}

export type CodeEditorAction = CodeEditorEditComponentCodeAction;

export interface CodeEditorEditComponentCodeAction {
  type: "code-editor-edit-component-code";
  id: string;
  framework: FrameworkConfig["framework"];
  componentName: string;
  raw: string;
}
