import type { DesignProvider } from "@design-sdk/core-types";
import type { ReflectSceneNode } from "@design-sdk/figma-node";

export interface DemoDesignSnapshot {
  id: string;
  name: string;
  url: string;
  source: DesignProvider;
  node: ReflectSceneNode;
}
