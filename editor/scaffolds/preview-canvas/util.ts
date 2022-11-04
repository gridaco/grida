import { colorFromFills } from "@design-sdk/core/utils";
import type { ReflectSceneNode } from "@design-sdk/figma-node";

export const blurred_bg_fill = (target: ReflectSceneNode) => {
  const __bg = colorFromFills(target.fills);
  const bg_color_str = __bg ? "#" + __bg.hex : "transparent";
  return bg_color_str;
};
