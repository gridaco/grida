import type cmath from "@grida/cmath";

/** Modifier-key snapshot at the moment an event was produced. */
export interface Modifiers {
  shift: boolean;
  alt: boolean;
  meta: boolean;
  ctrl: boolean;
}

export const NO_MODS: Modifiers = {
  shift: false,
  alt: false,
  meta: false,
  ctrl: false,
};

export type PointerButton = "primary" | "secondary" | "middle";

/**
 * Input event consumed by `Surface.dispatch`.
 *
 * All coordinates are **screen-space CSS pixels relative to the canvas**.
 * The surface owns the camera and converts to document-space internally.
 */
export type SurfaceEvent =
  | {
      kind: "pointer_move";
      x: number;
      y: number;
      mods: Modifiers;
    }
  | {
      kind: "pointer_down";
      x: number;
      y: number;
      button: PointerButton;
      mods: Modifiers;
    }
  | {
      kind: "pointer_up";
      x: number;
      y: number;
      button: PointerButton;
      mods: Modifiers;
    }
  | {
      kind: "modifiers";
      mods: Modifiers;
    }
  | {
      kind: "wheel";
      x: number;
      y: number;
      dx: number;
      dy: number;
      mods: Modifiers;
    }
  | {
      kind: "key";
      phase: "down" | "up";
      code: string;
      mods: Modifiers;
    }
  | { kind: "blur" };

/** Result of a `Surface.dispatch` call. */
export interface SurfaceResponse {
  needsRedraw: boolean;
  cursorChanged: boolean;
  hoverChanged: boolean;
}

export function emptyResponse(): SurfaceResponse {
  return {
    needsRedraw: false,
    cursorChanged: false,
    hoverChanged: false,
  };
}

/** Re-export Vector2 for convenience. */
export type Vector2 = cmath.Vector2;
