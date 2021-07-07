import { DesignProvider } from "@design-sdk/url-analysis";
import { nodes } from "@design-sdk/core";
export interface LoaderResult {
  id: string;
  name: string;
  url: string;
  source: DesignProvider;
  node: nodes.ReflectSceneNode;
}
