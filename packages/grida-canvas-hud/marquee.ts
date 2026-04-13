import cmath from "@grida/cmath";
import type { HUDDraw } from "./hud";

/**
 * Convert two marquee corner points into a {@link HUDDraw} command list.
 *
 * All coordinates are in **document space**.
 *
 * Produces a single rectangle with a stroke outline and a semi-transparent fill.
 */
export function marqueeToHUDDraw(a: cmath.Vector2, b: cmath.Vector2): HUDDraw {
  const rect = cmath.rect.fromPoints([a, b]);
  return {
    rects: [
      {
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
        fill: true,
        fillOpacity: 0.2,
      },
    ],
  };
}
