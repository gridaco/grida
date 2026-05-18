/** 8 cardinal/diagonal resize directions. */
export type ResizeDirection = "n" | "ne" | "e" | "se" | "s" | "sw" | "w" | "nw";

/** 4 corner positions for rotation handles. */
export type RotationCorner = "nw" | "ne" | "se" | "sw";

/**
 * Logical cursor icon names — the host maps these to CSS `cursor` values.
 *
 * `baseAngle` (radians) tilts the rendered arrow by an additional amount
 * on top of the variant's canonical orientation. Set automatically by the
 * surface for both variants:
 *
 * - **rotate**: `decideIdleCursor` reads the action's `initial_shape`
 *   and sets `baseAngle` to the matrix's screen-space rotation; the
 *   in-gesture `pointer_move` arm composes `initial_cursor_angle + delta`
 *   so the cursor tracks the live rotation, starting from the selection's
 *   pre-gesture orientation rather than 0.
 * - **resize**: `decideIdleCursor` reads the action's `initial_shape`
 *   and sets `baseAngle` to the matrix's screen-space rotation, so the
 *   resize cursor on a rotated selection tilts to align with the rotated
 *   edge / corner.
 *
 * For `kind: "rect"` selections (the common case) `baseAngle` resolves
 * to 0 and the cursor behaves identically to the pre-rotation builds.
 */
export type CursorIcon =
  | "default"
  | "pointer"
  | "move"
  | "crosshair"
  | "grab"
  | "grabbing"
  | "text"
  | { kind: "resize"; direction: ResizeDirection; baseAngle?: number }
  | { kind: "rotate"; corner: RotationCorner; baseAngle?: number };

/**
 * Angle-comparison bucket — radians. 0.5° in radians. Two icons are
 * considered equal when their `baseAngle`s round to the same bucket;
 * this is what prevents unnecessary `cursorChanged` re-emit during a
 * smooth rotate gesture, so the host repaints only on real motion.
 *
 * 0.5° is below human perception for cursor orientation, so the
 * quantization is visually free.
 */
export const CURSOR_ANGLE_BUCKET_RAD = Math.PI / 360;

/**
 * Quantize an angle (radians) to its `CURSOR_ANGLE_BUCKET_RAD` bucket.
 * Used by `cursorEquals` to decide whether two cursors with the same
 * variant differ visibly.
 */
export function angleBucket(rad: number | undefined): number {
  if (rad === undefined || rad === 0) return 0;
  return Math.round(rad / CURSOR_ANGLE_BUCKET_RAD);
}

/**
 * Pluggable cursor renderer.
 *
 * Maps a logical `CursorIcon` to a complete CSS `cursor:` value
 * (e.g. a native keyword like `"crosshair"` or a data-URL form like
 * `"url(data:...) 12 12, auto"`).
 *
 * The Surface owns one slot. Default = the built-in `cursorToCss` below.
 * Hosts opt into the bundled SVG renderer via
 * `surface.setCursorRenderer(cursors.defaultRenderer())` from
 * `@grida/hud/cursors`, or supply their own function for full control.
 */
export type CursorRenderer = (icon: CursorIcon) => string;

/**
 * Map a `CursorIcon` to the standard CSS `cursor` value. Hosts can override
 * for custom cursors.
 */
export function cursorToCss(c: CursorIcon): string {
  if (typeof c === "string") {
    switch (c) {
      case "default":
        return "default";
      case "pointer":
        return "pointer";
      case "move":
        return "move";
      case "crosshair":
        return "crosshair";
      case "grab":
        return "grab";
      case "grabbing":
        return "grabbing";
      case "text":
        return "text";
    }
  }
  if (c.kind === "resize") {
    // Standard resize cursor names.
    return `${c.direction}-resize`;
  }
  // Rotate doesn't have a standard CSS cursor; fall back to crosshair.
  return "crosshair";
}

/**
 * Cursor-equality used to detect changes without re-emitting `cursorChanged`.
 *
 * Two rotate/resize icons compare equal only when both the
 * discriminator (corner / direction) AND the bucketed `baseAngle` match.
 * This is what lets the state machine call `setCursor` every frame
 * during a rotate gesture and have `cursorChanged` fire only on real
 * angle changes (≥ `CURSOR_ANGLE_BUCKET_RAD` of motion).
 */
export function cursorEquals(a: CursorIcon, b: CursorIcon): boolean {
  if (typeof a === "string" && typeof b === "string") return a === b;
  if (typeof a !== "string" && typeof b !== "string") {
    if (a.kind === "resize" && b.kind === "resize") {
      return (
        a.direction === b.direction &&
        angleBucket(a.baseAngle) === angleBucket(b.baseAngle)
      );
    }
    if (a.kind === "rotate" && b.kind === "rotate") {
      return (
        a.corner === b.corner &&
        angleBucket(a.baseAngle) === angleBucket(b.baseAngle)
      );
    }
    return false;
  }
  return false;
}
