import type { RGBA } from "@reflect-ui/core";

/**
 * 255 rgba to 1 rgbo
 * @param rgba
 */
export const rgb255to_rgb1 = (rgba: RGBA) => {
  return {
    r: rgba.r / 255,
    g: rgba.g / 255,
    b: rgba.b / 255,
    o: 1 - rgba.a,
  };
};
