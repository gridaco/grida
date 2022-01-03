import type { ReflectSceneNode } from "@design-sdk/figma-node";
import { ComponentNode } from "@design-sdk/figma-types";
import { DesignInput } from "@designto/config/input";

export interface EditorState {
  selectedPage: string;
  selectedNodes: string[];
  selectedLayersOnPreview: string[];
  design: FigmaReflectRepository;
}

export interface EditorSnapshot {
  selectedPage: string;
  selectedNodes: string[];
  selectedLayersOnPreview: string[];
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
