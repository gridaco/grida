import type { guide } from "@grida/cmath/_snap";
import type { HUDDraw } from "./hud";

/**
 * Convert a `guide.SnapGuide` (the output of `guide.plot()`) into a
 * generic {@link HUDDraw} command list.
 *
 * Lines pass through directly (HUDLine extends cmath.ui.Line).
 * Points pass through directly (both are cmath.Vector2).
 * Rules are destructured from tuples to objects.
 */
export function snapGuideToHUDDraw(
  sg: guide.SnapGuide | undefined
): HUDDraw | undefined {
  if (!sg) return undefined;

  return {
    lines: sg.lines,
    rules: sg.rules.map(([axis, offset]) => ({ axis, offset })),
    points: sg.points,
  };
}
