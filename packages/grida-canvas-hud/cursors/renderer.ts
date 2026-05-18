/**
 * Default cursor renderer — maps `CursorIcon` → CSS `cursor:` value.
 *
 * Two responsibilities:
 *
 * 1. **Static-keyword passthrough** for cursors that don't need angle
 *    info (text, grab, crosshair, etc.) — defer to the canonical
 *    `cursorToCss` mapping shipped from `event/cursor.ts` so the
 *    fallback keyword stays the single source of truth.
 *
 * 2. **SVG generation** for rotation-sensitive cursors (rotate +
 *    8 resize directions). Each cardinal direction maps to a fixed
 *    base angle; when the icon carries a `baseAngle` (radians), it
 *    composes with the base. The renderer is stateless — the upstream
 *    `SurfaceState.setCursor` already gates re-emit at the
 *    `CURSOR_ANGLE_BUCKET_RAD` level via `cursorEquals`, so this
 *    function is invoked at most once per real change.
 *
 * Output shape per icon:
 *
 *     "url(data:image/svg+xml;base64,...) HOTSPOT_X HOTSPOT_Y, FALLBACK_KEYWORD"
 *
 * `FALLBACK_KEYWORD` is what `cursorToCss` would have returned. This
 * means a browser that fails to load the data URL (truly impossible for
 * inline base64, but the spec requires a fallback) lands on the
 * existing native cursor — never on `auto`.
 */

import {
  CURSOR_ANGLE_BUCKET_RAD,
  type CursorIcon,
  type CursorRenderer,
  type ResizeDirection,
  type RotationCorner,
  angleBucket,
  cursorToCss,
} from "../event/cursor";
import { svgDataUrl } from "./encode";
import {
  RESIZE_HOTSPOT,
  ROTATE_HOTSPOT,
  template_resize,
  template_rotate,
} from "./templates";

// ────────────────────────────────────────────────────────────────────────────
// Per-direction / per-corner base angles (degrees)
//
// **Resize:** the canonical template arrow is horizontal (E ↔ W). Each
// cardinal direction rotates from that baseline so the arrow points
// along the resize axis. NE/SW are the diagonal arrows; orientation is
// the same for opposite corners since the arrow is bidirectional.
//
// **Rotate:** the canonical template is the NE-oriented arrow used by
// the main editor (`anchor_initial_cursor_rotation`). The other corners
// rotate that template by the standard ±45° / ±135° offsets.
// ────────────────────────────────────────────────────────────────────────────

const RESIZE_BASE_ANGLE_DEG: Record<ResizeDirection, number> = {
  // Horizontal axis — canonical arrow direction.
  e: 0,
  w: 0,
  // Vertical axis.
  n: 90,
  s: 90,
  // Diagonal NE↔SW (slope −1 in screen coords; arrow tilts upward-right).
  ne: -45,
  sw: -45,
  // Diagonal NW↔SE (slope +1; arrow tilts downward-right).
  nw: 45,
  se: 45,
};

const ROTATE_BASE_ANGLE_DEG: Record<RotationCorner, number> = {
  nw: -45,
  ne: 45,
  se: 135,
  sw: -135,
};

const RAD_TO_DEG = 180 / Math.PI;

// ────────────────────────────────────────────────────────────────────────────
// Default renderer
// ────────────────────────────────────────────────────────────────────────────

/**
 * Build the default cursor renderer.
 *
 * Stateless — every call regenerates the data URL from scratch. This is
 * cheap (`template_*` is a string-concat, `btoa` of ~600 B is
 * sub-millisecond) AND the upstream `SurfaceState.setCursor` already
 * gates re-emit via `cursorEquals`, which buckets `baseAngle` to
 * `CURSOR_ANGLE_BUCKET_RAD`. Net result: this function is invoked at
 * most once per real bucket change — caching here would be redundant
 * and, sized wrong (the previous 64-entry LRU thrashed after ~32° of
 * drag), actively harmful.
 *
 * Hosts install via `surface.setCursorRenderer(...)`.
 *
 * @example
 *   import { cursors } from "@grida/hud/cursors";
 *   surface.setCursorRenderer(cursors.defaultRenderer());
 */
export function defaultRenderer(): CursorRenderer {
  return function render(icon: CursorIcon): string {
    if (typeof icon === "string") return cursorToCss(icon);
    if (icon.kind === "rotate") {
      return build_rotate_css(
        icon.corner,
        bucket_to_deg(angleBucket(icon.baseAngle))
      );
    }
    // resize — see `CursorIcon` in event/cursor.ts: `baseAngle` is
    // reserved for Phase B and currently always `undefined`, so the
    // bucket collapses to 0 and the output matches the canonical
    // per-direction arrow.
    return build_resize_css(
      icon.direction,
      bucket_to_deg(angleBucket(icon.baseAngle))
    );
  };
}

function bucket_to_deg(bucket: number): number {
  return bucket * CURSOR_ANGLE_BUCKET_RAD * RAD_TO_DEG;
}

// ────────────────────────────────────────────────────────────────────────────
// Builders
//
// `extra_angle_deg` is the bucketed `baseAngle` converted to degrees —
// added to the per-variant base angle. At idle (baseAngle = 0 or
// undefined) output matches the static per-direction / per-corner
// cursors. Fallback keyword preserves the legacy `cursorToCss` behavior
// when the data URL fails to load (spec requires a CSS fallback).
// ────────────────────────────────────────────────────────────────────────────

function build_cursor_css(
  template: (angle_deg: number) => string,
  hotspot: readonly [number, number],
  fallback: string,
  base_deg: number,
  extra_deg: number
): string {
  const url = svgDataUrl(template(base_deg + extra_deg));
  return `url(${url}) ${hotspot[0]} ${hotspot[1]}, ${fallback}`;
}

function build_rotate_css(
  corner: RotationCorner,
  extra_angle_deg: number
): string {
  return build_cursor_css(
    template_rotate,
    ROTATE_HOTSPOT,
    "crosshair",
    ROTATE_BASE_ANGLE_DEG[corner],
    extra_angle_deg
  );
}

function build_resize_css(
  direction: ResizeDirection,
  extra_angle_deg: number
): string {
  return build_cursor_css(
    template_resize,
    RESIZE_HOTSPOT,
    `${direction}-resize`,
    RESIZE_BASE_ANGLE_DEG[direction],
    extra_angle_deg
  );
}
