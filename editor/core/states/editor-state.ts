import type { ReflectSceneNode } from "@design-sdk/figma-node";
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

interface FigmaReflectRepository {
  /**
   * fileid; filekey
   */
  key: string;

  // TODO:
  pages: { id: string; name: string; children: ReflectSceneNode[] }[];
  input: DesignInput;
}
