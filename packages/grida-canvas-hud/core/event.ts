// Synthesized input event vocabulary.
//
// Bedrock — class-agnostic. Identical shape to legacy `event/event.ts`;
// re-declared here so `core/` stays import-isolated from legacy code.
// Once the orchestrator follow-up dissolves legacy, the legacy file
// re-exports from this canonical location.

import type cmath from "@grida/cmath";

/** Modifier-key snapshot at the moment an event was produced. */
export interface Modifiers {
  readonly shift: boolean;
  readonly alt: boolean;
  readonly meta: boolean;
  readonly ctrl: boolean;
}

export const NO_MODS: Modifiers = {
  shift: false,
  alt: false,
  meta: false,
  ctrl: false,
};

export type PointerButton = "primary" | "secondary" | "middle";

/**
 * Synthesized input event consumed by HUD bedrock.
 *
 * All coordinates are **screen-space CSS pixels relative to the
 * canvas viewport**. The consumer holds the camera and converts to
 * document-space via {@link Transform}.
 */
export type HUDEvent =
  | {
      readonly kind: "pointer_move";
      readonly x: number;
      readonly y: number;
      readonly mods: Modifiers;
    }
  | {
      readonly kind: "pointer_down";
      readonly x: number;
      readonly y: number;
      readonly button: PointerButton;
      readonly mods: Modifiers;
    }
  | {
      readonly kind: "pointer_up";
      readonly x: number;
      readonly y: number;
      readonly button: PointerButton;
      readonly mods: Modifiers;
    }
  | {
      readonly kind: "modifiers";
      readonly mods: Modifiers;
    }
  | {
      readonly kind: "wheel";
      readonly x: number;
      readonly y: number;
      readonly dx: number;
      readonly dy: number;
      readonly mods: Modifiers;
    }
  | {
      readonly kind: "key";
      readonly phase: "down" | "up";
      readonly code: string;
      readonly mods: Modifiers;
    }
  | { readonly kind: "blur" };

/** Convenience re-export. */
export type Vector2 = cmath.Vector2;
