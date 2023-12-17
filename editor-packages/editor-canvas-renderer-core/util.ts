import { colorFromFills } from "@design-sdk/core/utils";
import type { Paint } from "@design-sdk/figma";

export const blurred_bg_fill = (fills: ReadonlyArray<Paint>) => {
  const __bg = colorFromFills(fills);
  const bg_color_str = __bg ? "#" + __bg.hex : "transparent";
  return bg_color_str;
};
