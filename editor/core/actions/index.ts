import type { FrameworkConfig } from "@grida/builder-config";
import type {
  ConsoleLog,
  EditorState,
  EditorTask,
  ScenePreviewData,
} from "core/states";

export type WorkspaceAction =
  | HistoryAction
  | HighlightNodeAction
  | EditorModeAction;

/**
 * actions that can be executed while workspace is being warmed up.
 */
export type WorkspaceWarmupAction = SetFigmaAuthAction | SetFigmaUserAction;

export type HistoryAction =
  //
  | { type: "undo" }
  //
  | { type: "redo" }
  | Action;

export type Action =
  | SetFigmaAuthAction
  | SetFigmaUserAction
  | PageAction
  | EditorModeAction
  | DesignerModeSwitchActon
  | SelectNodeAction
  | LocateNodeAction
  | HighlightNodeAction
  | CanvasEditAction
  | CanvasModeAction
  | PreviewAction
  | CodeEditorAction
  | DevtoolsAction
  | BackgroundTaskAction;

export type ActionType = Action["type"];

export type SetFigmaAuthAction = {
  type: "set-figma-auth";
  authentication: {
    personalAccessToken?: string;
    accessToken?: string;
  };
};

export type SetFigmaUserAction = {
  type: "set-figma-user";
  user: {
    id: string;
    name: string;
    profile: string;
  };
};

export type EditorModeAction = EditorModeSwitchAction;
export type EditorModeSwitchAction = {
  type: "mode";
  mode: EditorState["mode"]["value"] | "goback";
};

export type DesignerModeSwitchActon = {
  type: "designer-mode";
  mode: EditorState["designerMode"];
};

export interface SelectNodeAction {
  type: "select-node";
  node: string | string[];
}

/**
 * Select and move to the node.
 */
export interface LocateNodeAction {
  type: "locate-node";
  node: string;
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

export interface HighlightNodeAction {
  type: "highlight-node";
  id: string;
}

type CanvasModeAction = CanvasModeSwitchAction;
export interface CanvasModeSwitchAction {
  type: "canvas-mode";
  mode: EditorState["canvasMode"]["value"] | "goback";
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

export type DevtoolsAction = DevtoolsConsoleAction | DevtoolsConsoleClearAction;
export interface DevtoolsConsoleAction {
  type: "devtools-console";
  log: ConsoleLog;
}

export interface DevtoolsConsoleClearAction {
  type: "devtools-console-clear";
}

export type BackgroundTaskAction =
  | BackgroundTaskPushAction
  | BackgroundTaskPopAction
  | BackgroundTaskUpdateProgressAction;

export interface BackgroundTaskPushAction {
  type: "editor-task-push";
  task: EditorTask;
}

export interface BackgroundTaskPopAction {
  type: "editor-task-pop";
  task: EditorTask | { id: string };
}

export interface BackgroundTaskUpdateProgressAction {
  type: "editor-task-update-progress";
  id: string;
  progress: number;
}
