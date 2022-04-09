import type { ReflectSceneNode } from "@design-sdk/figma-node";
import type { FrameworkConfig } from "@designto/config";
import { ComponentNode } from "@design-sdk/figma-types";
import { DesignInput } from "@designto/config/input";

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
  pages: { id: string; name: string; children: ReflectSceneNode[] }[];
  components: { [key: string]: ComponentNode };
  // styles: { [key: string]: {} };
  input: DesignInput;
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
