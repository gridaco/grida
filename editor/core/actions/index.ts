import { CraftHistoryAction, CraftDraftAction } from "@code-editor/craft/core";
import type { FrameworkConfig } from "@grida/builder-config";
import type {
  ConsoleLog,
  EditorState,
  BackgroundTask,
  ScenePreviewData,
  File,
} from "core/states";

export type WorkspaceAction =
  | { type: "copy" } // copy does not need to be handled by the history.
  | HistoryAction
  | HighlightNodeAction
  | EditorModeAction;

/**
 * actions that can be executed while workspace is being warmed up.
 */
export type WorkspaceWarmupAction = SetFigmaAuthAction | SetFigmaUserAction;

export type HistoryAction =
  | { type: "undo" }
  | { type: "redo" }
  | { type: "cut" }
  | { type: "paste" }
  | Action;

export type Action =
  | SetDebugModeAction
  | SetFigmaAuthAction
  | SetFigmaUserAction
  | PageAction
  | EditorModeAction
  | DesignerModeSwitchActon
  | SelectNodeAction
  | CanvasFocusNodeAction
  | HighlightNodeAction
  | EnterIsolatedInspectionAction
  | ExitIsolatedInspectionAction
  | CanvasEditAction
  | CanvasModeAction
  | PreviewAction
  | CodingAction
  | DevtoolsAction
  | BackgroundTaskAction
  // craft mode
  | CraftHistoryAction
  | CraftDraftAction;
//

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

export interface CanvasFocusNodeAction {
  type: "canvas/focus";
  node: string;
}

export type CanvasEditAction =
  | TranslateDeltaSelectedNodeAction
  | PositionSelectedNodeAction
  | ResizeSelectedNodeAction;

/**
 * Select and move to the node.
 */
export interface TranslateDeltaSelectedNodeAction {
  type: "node-transform-translate";
  /**
   * delta value
   */
  translate: [number | undefined, number | undefined];
}

export interface PositionSelectedNodeAction {
  type: "node-transform-position";
  x?: number;
  y?: number;
}

export interface ResizeSelectedNodeAction {
  type: "node-resize";
  origin: "center" | "nw" | "ne" | "sw" | "se" | "n" | "s" | "w" | "e";
  width?: number;
  height?: number;
}

export interface EnterIsolatedInspectionAction {
  type: "design/enter-isolation";
  node: string;
}

export interface ExitIsolatedInspectionAction {
  type: "design/exit-isolation";
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

export type CodingAction =
  | CodingNewTemplateSessionAction
  | CodingInitialFilesSeedAction
  | CodingUpdateFileAction;

export type CodingInitialFilesSeedAction = {
  type: "coding/initial-seed";
  files: {
    [key: string]: File & {
      exports?: string[];
    };
  };
  entry: string;
  open?: string | string[] | "*";
  focus?: string;
};

export type CodingNewTemplateSessionAction = {
  type: "coding/new-template-session";
  template: {
    type: "d2c";
    target: string;
  };
};

type RequestAction<T> = T & { $id: string };

// export type CodingCompileRequestAction = RequestAction<
//   {
//     type: "coding/compile-request";
//     files: { [key: string]: File };
//   } & (
//     | {
//         framework: "react";
//         transpiler: "auto" | "esbuild-wasm";
//       }
//     | {
//         framework: "flutter";
//         transpiler: "auto" | "dart-services";
//       }
//   )
// >;

export interface CodingUpdateFileAction {
  type: "codeing/update-file";
  key: string;
  content: string;
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
  type: "tasks/push";
  task: BackgroundTask;
}

export interface BackgroundTaskPopAction {
  type: "tasks/pop";
  task: BackgroundTask | { id: string };
}

export interface BackgroundTaskUpdateProgressAction {
  type: "tasks/update-progress";
  id: string;
  progress: number;
}

export type SetDebugModeAction = {
  type: "debug-mode/enable";
  enabled: boolean;
};
