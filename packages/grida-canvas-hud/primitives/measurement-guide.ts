import type { Measurement } from "@grida/cmath/_measurement";
import {
  guide_line_xylr,
  auxiliary_line_xylr,
} from "@grida/cmath/_measurement";
import cmath from "@grida/cmath";
import type { HUDDraw, HUDLine, HUDRect } from "./types";

const SIDES = ["top", "right", "bottom", "left"] as const;

/**
 * Convert a {@link Measurement} (the output of `measure()`) into a
 * generic {@link HUDDraw} command list.
 *
 * All coordinates are in **document space** — the HUD canvas applies
 * the viewport transform.
 *
 * Produces:
 * - Two stroke-only rects for the A and B bounding boxes
 * - One labelled guide line per non-zero distance (solid)
 * - One auxiliary line per non-zero side connecting the guide to B (dashed)
 *
 * If `color` is provided, every emitted line and rect carries that color so
 * the guides render distinctly from the canvas's chrome color. When used via
 * `surface.draw(extra)` (the host-fed-extras channel) this is required to
 * separate measurement from selection chrome on a shared canvas.
 */
export function measurementToHUDDraw(m: Measurement, color?: string): HUDDraw {
  const { a, b, box, distance } = m;

  const rects: HUDRect[] = [
    { x: a.x, y: a.y, width: a.width, height: a.height, color },
    { x: b.x, y: b.y, width: b.width, height: b.height, color },
  ];

  const lines: HUDLine[] = [];

  for (let i = 0; i < 4; i++) {
    const dist = distance[i];
    if (dist <= 0) continue;

    const side = SIDES[i];
    const label = cmath.ui.formatNumber(dist, 1);

    // Guide line from box edge outward by `dist`
    const [x1, y1, x2, y2] = guide_line_xylr(box, side, dist);
    lines.push({ x1, y1, x2, y2, label, color });

    // Auxiliary dashed line from guide endpoint toward rect B
    const [ax1, ay1, ax2, ay2, aLen] = auxiliary_line_xylr([x2, y2], b, side);
    if (aLen > 0) {
      lines.push({
        x1: ax1,
        y1: ay1,
        x2: ax2,
        y2: ay2,
        dashed: true,
        color,
      });
    }
  }

  return { rects, lines };
}
