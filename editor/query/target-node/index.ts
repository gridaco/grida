import { nodes } from "@design-sdk/core";
import { RawNodeResponse } from "@design-sdk/figma-remote";

export interface TargetNodeConfig<R = any, P = any> {
  remote: R;
  figma: P;
  reflect: nodes.ReflectSceneNode;
  url: string;
  file: string;
  node: string;
  raw: RawNodeResponse;
}
