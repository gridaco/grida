import type cmath from "@grida/cmath";
import type { HUDDraw } from "./hud";

/**
 * Convert a lasso point sequence into a {@link HUDDraw} command list.
 *
 * All coordinates are in **document space**.
 *
 * Produces a single polyline with a dashed stroke and a semi-transparent fill.
 */
export function lassoToHUDDraw(points: cmath.Vector2[]): HUDDraw | undefined {
  if (points.length < 2) return undefined;
  return {
    polylines: [
      {
        points,
        fill: true,
        fillOpacity: 0.2,
        dashed: true,
      },
    ],
  };
}
