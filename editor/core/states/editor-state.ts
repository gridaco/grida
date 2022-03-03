import type { ReflectSceneNode } from "@design-sdk/figma-node";
import { ComponentNode } from "@design-sdk/figma-types";
import { DesignInput } from "@designto/config/input";

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
}

export interface EditorSnapshot {
  selectedPage: string;
  selectedNodes: string[];
  selectedLayersOnPreview: string[];
  selectedNodesInitial?: string[] | null;
  design: FigmaReflectRepository;
}

export interface FigmaReflectRepository {
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
