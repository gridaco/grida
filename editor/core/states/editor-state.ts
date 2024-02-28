import type { ReflectSceneNode } from "@design-sdk/figma-node";
import type { FrameworkConfig } from "@grida/builder-config";
import type { RGBA, WidgetKey } from "@reflect-ui/core";
import type { ComponentNode } from "@design-sdk/figma-types";
import type { DesignInput } from "@grida/builder-config/input";
import type { File } from "@grida/builder-config/output/output-file";
import { type CraftElement } from "@code-editor/craft/core";

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
export type TEditorMode = "design" | "code" | "run" | "craft";
type TDesignerMode = "inspect" | "comment"; // | "prototype";

export type EditorPage = {
  id: string;
  name: string;
  type: "home" | "code" | "figma-canvas" | "craft";
};

export interface EditorState {
  pages: EditorPage[];
  selectedPage: string;
  selectedNodes: string[];
  canvas: {
    focus: CanvasFocusData;
  };
  isolation: NodeIsolationData;
  selectedLayersOnPreview: string[];
  /**
   * this is the initial node selection triggered by the url param, not caused by the user interaction.
   * after once user interacts and selects other node, this selection will be cleared, set to null.
   * > only set by the url pararm or other programatic cause, not caused by after-load user interaction.
   */
  selectedNodesInitial?: string[] | null;
  design: DesignRepository;
  mode: LastKnown<TEditorMode>;
  designerMode: TDesignerMode;
  canvasMode: LastKnown<TCanvasMode>;
  currentPreview?: ScenePreviewData;
  code: CodeRepository;
  devtoolsConsole?: DevtoolsConsole;

  // v2 (with craft mode)
  craft: {
    children: EditorNode[];
  };
}

type EditorNode = CraftElement;

export interface EditorSnapshot {
  pages: EditorPage[];
  selectedPage: string;
  selectedNodes: string[];
  selectedLayersOnPreview: string[];
  selectedNodesInitial?: string[] | null;
  design: DesignRepository;
  isolation: NodeIsolationData;
  code: CodeRepository;
  canvasMode: EditorState["canvasMode"];
  craft?: EditorState["craft"];
}

export type DesignRepository = FigmaReflectRepository; // | CraftDesignRepository;

export interface FigmaReflectRepository {
  /**
   * name of the file
   */
  name: string;

  /**
   * fileid; filekey
   */
  key: string;

  version: string;

  lastModified: Date;

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

// export interface CraftDesignRepository {
//   name: string;
//   key: string;
//   version: string;
//   lastModified: Date;
//   pages: {
//     id: string;
//     name: string;
//     children: ReflectSceneNode[];
//     backgroundColor: RGBA;
//   }[];
// }

export type CanvasFocusData = {
  /**
   * refresh key is passed to the canvas to force the focus update, event the last focus is same as the current focus.
   * this is required because the canvas has indipendent transform state, and it can loose focus to the focus node.
   */
  refreshkey: string;
  nodes: string[];
};

export interface NodeIsolationData {
  isolated: boolean;
  node: string;
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
  files: { [key: string]: File };
  loading?: boolean;
  runner?: {
    type: "scene";
    sceneId: string;
    entry?: string;
  };
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
