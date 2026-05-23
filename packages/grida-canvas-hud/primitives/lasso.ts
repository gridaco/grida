import type cmath from "@grida/cmath";
import type { HUDDraw } from "./types";

/**
 * Convert a lasso point sequence into a {@link HUDDraw} command list.
 *
 * All coordinates are in **document space**.
 *
 * Produces a single polyline with a dashed stroke and a semi-transparent fill.
 * The polyline lives on the {@link HUDDraw} TOP layer (`topPolylines`) so it
 * always paints above knobs, handles, outlines, and any other surface chrome
 * — the user must always see the live lasso region they are drawing,
 * regardless of what it overlaps. Standalone `<Lasso/>` overlays render on
 * their own canvas and don't need this guarantee, but routing through the
 * top slot makes hosts that inline the draw into the surface canvas behave
 * identically.
 */
export function lassoToHUDDraw(points: cmath.Vector2[]): HUDDraw | undefined {
  if (points.length < 2) return undefined;
  return {
    topPolylines: [
      {
        points,
        fill: true,
        fillOpacity: 0.2,
        dashed: true,
      },
    ],
  };
}
