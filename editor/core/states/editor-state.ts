import type { ReflectSceneNode } from "@design-sdk/figma-node";
import type { FrameworkConfig } from "@designto/config";
import type { RGBA, WidgetKey } from "@reflect-ui/core";
import type { ComponentNode } from "@design-sdk/figma-types";
import type { DesignInput } from "@designto/config/input";

/**
 * View mode of the canvas.
 * - full - default
 * - isolated - focus to one scene
 */
type TCanvasMode = "free" | "isolated-view" | "fullscreen-preview";

export interface EditorState {
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
  canvasMode: TCanvasMode;
  canvasMode_previous?: TCanvasMode;
  currentPreview?: ScenePreviewData;
  code?: CodeRepository;
  editingModule?: EditingModule;
}

export interface EditorSnapshot {
  selectedPage: string;
  selectedNodes: string[];
  selectedLayersOnPreview: string[];
  selectedNodesInitial?: string[] | null;
  design: FigmaReflectRepository;
  canvasMode: TCanvasMode;
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
    bundler: "vanilla" | "esbuild-wasm" | "dart-services";
    framework: FrameworkConfig["framework"];
    reason: "fill-assets" | "initial" | "update";
  };
  updatedAt: number;
}

interface IScenePreviewDataVanillaPreview extends IScenePreviewData<string> {
  loader: "vanilla-html";
  source: string;
}

interface IScenePreviewDataFlutterPreview extends IScenePreviewData<string> {
  loader: "vanilla-flutter-template";
  source: string;
}

interface IScenePreviewDataEsbuildPreview
  extends IScenePreviewData<{
    html: string;
    javascript: string;
  }> {
  loader: "vanilla-esbuild-template";
}

export interface CodeRepository {
  // TODO:
  // files: { [key: string]: string };
}

type TEditingModuleType = "single-file-component";

export interface EditingModule {
  type: TEditingModuleType;
  componentName: string;
  framework: FrameworkConfig["framework"];
  lang: string;
  raw: string;
}
