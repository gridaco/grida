import type { ReflectSceneNode } from "@design-sdk/figma-node";
import type { FrameworkConfig } from "@grida/builder-config";
import type { RGBA, WidgetKey } from "@reflect-ui/core";
import type { ComponentNode } from "@design-sdk/figma-types";
import type { DesignInput } from "@grida/builder-config/input";
import type { File } from "@grida/builder-config/output/output-file";

export type { File };

type LastKnown<T> = {
  value: T;
  last?: T | undefined;
  updated?: Date | undefined;
};

/**
 * View mode of the canvas.
 * - free - default
 * - focus - focus to one scene
 */
type TCanvasMode = "free" | "focus";

/**
 * Task mode of the editor.
 * - design - default (design view)
 * - code - with coding editor
 * - run - run app, full screen
 */
type TEditorMode = "design" | "code" | "run";
type TDesignerMode = "inspect" | "comment"; // | "prototype";

export type EditorPage = {
  id: string;
  name: string;
  type: "home" | "code" | "figma-canvas";
};

export interface EditorState {
  pages: EditorPage[];
  selectedPage: string;
  selectedNodes: string[];
  selectedLayersOnPreview: string[];
  /**
   * this is the initial node selection triggered by the url param, not caused by the user interaction.
   * after once user interacts and selects other node, this selection will be cleared, set to null.
   * > only set by the url pararm or other programatic cause, not caused by after-load user interaction.
   */
  selectedNodesInitial?: string[] | null;
  design: FigmaReflectRepository;
  mode: LastKnown<TEditorMode>;
  designerMode: TDesignerMode;
  canvasMode: LastKnown<TCanvasMode>;
  currentPreview?: ScenePreviewData;
  code: CodeRepository;
  editingModule?: EditingModule;
  devtoolsConsole?: DevtoolsConsole;
  editorTaskQueue: EditorTaskQueue;
}

export interface EditorSnapshot {
  pages: EditorPage[];
  selectedPage: string;
  selectedNodes: string[];
  selectedLayersOnPreview: string[];
  selectedNodesInitial?: string[] | null;
  design: FigmaReflectRepository;
  code: CodeRepository;
  canvasMode: EditorState["canvasMode"];
  editorTaskQueue: EditorTaskQueue;
}

export interface FigmaReflectRepository {
  /**
   * name of the file
   */
  name: string;

  /**
   * fileid; filekey
   */
  key: string;

  // TODO:
  pages: {
    id: string;
    name: string;
    children: ReflectSceneNode[];
    backgroundColor: RGBA;
    flowStartingPoints: any[];
  }[];
  components: { [key: string]: ComponentNode };
  // styles: { [key: string]: {} };
  input: DesignInput;
}

export type ScenePreviewData =
  | IScenePreviewDataVanillaPreview
  | IScenePreviewDataFlutterPreview
  | IScenePreviewDataEsbuildPreview;

export interface IScenePreviewData<T> {
  viewtype: "page" | "component" | "layer" | "unknown";
  widgetKey: WidgetKey;
  componentName: string;
  fallbackSource: string;
  source: T;
  initialSize: { width: number; height: number };
  isBuilding: boolean;
  meta: {
    bundler: "vanilla" | "esbuild-wasm" | "dart-services" | "flutter-daemon";
    framework: FrameworkConfig["framework"];
    reason: "fill-assets" | "initial" | "update";
  };
  updatedAt: number;
}

export interface IScenePreviewDataVanillaPreview
  extends IScenePreviewData<string> {
  loader: "vanilla-html";
  source: string;
}

export interface IScenePreviewDataFlutterPreview
  extends IScenePreviewData<string> {
  loader: "vanilla-flutter-template" | "flutter-daemon-view";
  source: string;
}

export interface IScenePreviewDataEsbuildPreview
  extends IScenePreviewData<{
    html: string;
    javascript: string;
  }> {
  loader: "vanilla-esbuild-template";
}

export interface CodeRepository {
  target?: string;
  files: { [key: string]: File };
  loading?: boolean;
}

type TEditingModuleType = "single-file-component";

export interface EditingModule {
  type: TEditingModuleType;
  componentName: string;
  framework: FrameworkConfig["framework"];
  lang: string;
  raw: string;
}

interface DevtoolsConsole {
  logs: ConsoleLog[];
}

export interface ConsoleLog {
  id?: string;
  data: any[];
  method:
    | "log"
    | "debug"
    | "info"
    | "warn"
    | "error"
    | "table"
    | "clear"
    | "time"
    | "timeEnd"
    | "count"
    | "assert";
}

export interface EditorTaskQueue {
  isBusy: boolean;
  tasks: EditorTask[];
}

export interface EditorTask {
  id: string;
  name: string;
  /**
   * If the task is short-lived, wait this much ms before displaying it.
   * @default 200 (0.2s)
   */
  debounce?: number;
  description?: string;
  cancelable?: boolean;
  onCancel?: () => void;
  /**
   * 0-1, if null, it is indeterminate
   */
  progress: number | null;
  createdAt?: Date;
}
