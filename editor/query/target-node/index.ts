import { ReflectSceneNode } from "@design-sdk/figma-node";
import { RawNodeResponse } from "@design-sdk/figma-remote";

export interface TargetNodeConfig<R = any, P = any> {
  remote: R;
  figma: P;
  reflect: ReflectSceneNode;
  url: string;
  file: string;
  node: string;
  raw: RawNodeResponse;
}
