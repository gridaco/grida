import type { ReflectSceneNode } from "@design-sdk/figma-node";
import type { FrameOptimizationFactors } from "@code-editor/canvas/frame";

export type VanillaPreviewProps = {
  target: ReflectSceneNode & {
    page: string;
    filekey: string;
  };
} & FrameOptimizationFactors;
