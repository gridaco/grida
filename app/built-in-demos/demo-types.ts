import { DesignProvider } from "@design-sdk/core-types";
import { nodes } from "@design-sdk/core";

export interface DemoDesignSnapshot {
  id: string;
  name: string;
  url: string;
  source: DesignProvider;
  node: nodes.ReflectSceneNode;
}
