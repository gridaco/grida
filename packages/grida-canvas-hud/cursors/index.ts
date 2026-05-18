/**
 * `@grida/hud/cursors` — opt-in default cursor renderer.
 *
 * Hosts wire it once at construction:
 *
 *     import { cursors } from "@grida/hud/cursors";
 *     surface.setCursorRenderer(cursors.defaultRenderer());
 *
 * Tree-shake invariant: nothing in `surface/`, `event/`, or
 * `primitives/` may import from this directory. Hosts that don't import
 * the subpath pay zero bundle cost. See `__tests__/cursors.test.ts` for
 * the import-graph assertion that enforces this.
 *
 * Templates and the encoder are re-exported for hosts that want to
 * render cursor previews in sidebar UI without going through the Surface.
 */

import { defaultRenderer } from "./renderer";
import { svgDataUrl } from "./encode";
import {
  RESIZE_HOTSPOT,
  ROTATE_HOTSPOT,
  template_resize,
  template_rotate,
} from "./templates";

/**
 * Convenience namespace export. All cursor utilities are also available
 * as named imports — but `cursors.defaultRenderer()` reads more cleanly
 * at host call sites, mirroring the main editor's `cursors.*` style.
 */
export const cursors = {
  defaultRenderer,
  svgDataUrl,
  templates: {
    rotate: template_rotate,
    resize: template_resize,
  },
  hotspots: {
    rotate: ROTATE_HOTSPOT,
    resize: RESIZE_HOTSPOT,
  },
} as const;

export { defaultRenderer, svgDataUrl };
export type { CursorRenderer } from "../event/cursor";
