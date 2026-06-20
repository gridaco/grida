// Cursor icons — value types and pure helpers.
//
// Bedrock primitives: the only external dependency permitted is the
// `@grida/cmath` type vocabulary (per the `primitives/bedrock.ts` layering
// contract, enforced by `__tests__/api/import-graph.test.ts`). `CursorIcon`
// is the logical name a `HUDObject.cursor` field carries; rendering to a CSS
// `cursor` string (or to a custom SVG renderer) is a host concern wired by
// the deferred orchestrator.
//
// Mirrors `event/cursor.ts`; the legacy file remains in place until the
// orchestrator follow-up dissolves it. While both files exist, this
// copy is the canonical bedrock form.

import type cmath from "@grida/cmath";

/** 8 cardinal/diagonal resize directions. Aliased from the cmath single
 *  source of truth (`cmath.compass.ResizeDirection`). */
export type ResizeDirection = cmath.compass.ResizeDirection;

/** 4 corner positions for rotation handles. */
export type RotationCorner = "nw" | "ne" | "se" | "sw";

/**
 * Logical cursor icon names.
 *
 * `baseAngle` (radians) tilts the rendered arrow by an additional
 * amount on top of the variant's canonical orientation; the
 * orchestrator sets it when a gesture rotates a selection so the
 * cursor tracks live rotation.
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
 * Angle quantization bucket — 0.5° in radians. Two rotated cursors
 * compare equal when their `baseAngle`s round to the same bucket.
 *
 * 0.5° is below human perception for cursor orientation, so the
 * quantization is visually free.
 */
export const CURSOR_ANGLE_BUCKET_RAD = Math.PI / 360;

/** Quantize an angle (radians) to its `CURSOR_ANGLE_BUCKET_RAD` bucket. */
export function angleBucket(rad: number | undefined): number {
  if (rad === undefined || rad === 0) return 0;
  return Math.round(rad / CURSOR_ANGLE_BUCKET_RAD);
}

/**
 * Pluggable cursor renderer — maps a logical `CursorIcon` to a CSS
 * `cursor:` value. Bedrock ships {@link cursorToCss} as the default;
 * hosts compose their own to substitute SVG data-URLs or platform
 * extensions.
 */
export type CursorRenderer = (icon: CursorIcon) => string;

/**
 * Default mapping from `CursorIcon` to CSS `cursor` value.
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
    return `${c.direction}-resize`;
  }
  return "crosshair";
}

/**
 * Cursor equality with `baseAngle` bucketing.
 *
 * Lets a hot path (a rotate-in-progress gesture's per-frame setCursor)
 * emit `cursorChanged` only on visible motion (≥ one bucket of
 * rotation).
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
