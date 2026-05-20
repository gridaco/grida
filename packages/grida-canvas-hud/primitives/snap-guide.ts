import type { guide } from "@grida/cmath/_snap";
import type { HUDDraw, HUDLine, HUDPoint, HUDRule } from "./types";

/**
 * Convert a `guide.SnapGuide` (the output of `guide.plot()`) into a
 * generic {@link HUDDraw} command list.
 *
 * `color`, when supplied, is applied as the per-item stroke override
 * for every emitted line, rule, and point. When absent, the HUD
 * canvas's current color is used.
 */
export function snapGuideToHUDDraw(
  sg: guide.SnapGuide | undefined,
  color?: string
): HUDDraw | undefined {
  if (!sg) return undefined;

  const lines: HUDLine[] = sg.lines.map((l) => ({ ...l, color }));
  const rules: HUDRule[] = sg.rules.map(([axis, offset]) => ({
    axis,
    offset,
    color,
  }));
  const points: HUDPoint[] = sg.points.map(([x, y]) => ({ x, y, color }));
  return { lines, rules, points };
}
