import type { ReflectSceneNode } from "@design-sdk/figma-node";
import { DesignInput } from "@designto/config/input";

export interface EditorState {
  selectedPage: string;
  selectedNodes: string[];
  design: ReflectRepository;
}

export interface EditorSnapshot {
  selectedPage: string;
  selectedNodes: string[];
  design: ReflectRepository;
}

interface ReflectRepository {
  /**
   * fileid; filekey
   */
  key: string;

  // TODO:
  pages: [];
  current: DesignInput;
}
