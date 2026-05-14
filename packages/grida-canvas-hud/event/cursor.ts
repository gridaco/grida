/** 8 cardinal/diagonal resize directions. */
export type ResizeDirection = "n" | "ne" | "e" | "se" | "s" | "sw" | "w" | "nw";

/** 4 corner positions for rotation handles. */
export type RotationCorner = "nw" | "ne" | "se" | "sw";

/** Logical cursor icon names — the host maps these to CSS `cursor` values. */
export type CursorIcon =
  | "default"
  | "pointer"
  | "move"
  | "crosshair"
  | "grab"
  | "grabbing"
  | "text"
  | { kind: "resize"; direction: ResizeDirection }
  | { kind: "rotate"; corner: RotationCorner };

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

/** Cursor-equality used to detect changes without object allocations. */
export function cursorEquals(a: CursorIcon, b: CursorIcon): boolean {
  if (typeof a === "string" && typeof b === "string") return a === b;
  if (typeof a !== "string" && typeof b !== "string") {
    if (a.kind === "resize" && b.kind === "resize") {
      return a.direction === b.direction;
    }
    if (a.kind === "rotate" && b.kind === "rotate") {
      return a.corner === b.corner;
    }
    return false;
  }
  return false;
}
